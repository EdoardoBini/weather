import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ConfigService } from './config.service';
import {
  LocationResult,
  OpenCageResponse,
  OpenCageResult,
  ApiError,
  WeatherServiceError,
} from '../../shared/interfaces';

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  constructor(private http: HttpClient, private configService: ConfigService) {}

  /**
   * Geocodes an address using the OpenCage API, optionally restricted by country code.
   * Returns an observable with the best matching location result or null if not found.
   */
  geocode(address: string, countryCode?: string): Observable<LocationResult | null> {
    const apiKey = this.configService.get<string>('opencageApiKey') || '';
    let url: string;
    if (countryCode) {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        address
      )}&key=${apiKey}&countrycode=${countryCode}&limit=5`;
    } else if (this.isLikelyItalianAddress(address)) {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        address
      )}&key=${apiKey}&countrycode=it&language=it&limit=5`;
    } else {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        address
      )}&key=${apiKey}&limit=5`;
    }
    return this.http.get<OpenCageResponse>(url).pipe(
      map((data) => {
        if (data.results && data.results.length > 0) {
          try {
            // Find the best result based on confidence and validation
            const validResult = this.findBestResult(data.results, address);

            if (validResult) {
              return {
                latitude: validResult.geometry.lat,
                longitude: validResult.geometry.lng,
                address: validResult.formatted,
                confidence: validResult.confidence,
              };
            } else {
              // No valid result found - throw validation error
              throw new Error(
                'VALIDATION_ERROR: Invalid or not found address. Please check that the city and province are correct.'
              );
            }
          } catch (error: any) {
            // If findBestResult threw a specific validation error, re-throw it
            if (error.message?.startsWith('VALIDATION_ERROR:')) {
              throw error;
            } else {
              throw new Error(
                'VALIDATION_ERROR: Invalid or not found address. Please check that the city and province are correct.'
              );
            }
          }
        } else {
          // No results returned
          throw new Error('NO_RESULTS: No results found for this address.');
        }
      }),
      catchError((error: any) => {
        if (
          error.message?.startsWith('VALIDATION_ERROR') ||
          error.message?.startsWith('NO_RESULTS')
        ) {
          // Re-throw our custom errors
          throw error;
        }
        // Handle HTTP and other errors
        if (error.status === 402) {
          throw new Error('API_ERROR: Daily API limit reached. Please try again tomorrow.');
        } else if (error.status === 403) {
          throw new Error('API_ERROR: Invalid API key.');
        } else if (error.status >= 500) {
          throw new Error('API_ERROR: Service temporarily unavailable. Please try again later.');
        } else if (error.status === 0) {
          throw new Error('NETWORK_ERROR: Internet connection not available.');
        } else {
          throw new Error('API_ERROR: Error in the geocoding service. Please try again later.');
        }
      })
    );
  }

  // Simple heuristic: if address contains only Italian city/province names, use Italian search
  /**
   * Heuristic to determine if an address is likely Italian based on keywords.
   */
  private isLikelyItalianAddress(address: string): boolean {
    // You can improve this with a list of Italian cities/provinces
    // For now, check for common Italian keywords
    const lower = address.toLowerCase();
    return (
      lower.includes('milano') ||
      lower.includes('roma') ||
      lower.includes('napoli') ||
      lower.includes('torino') ||
      lower.includes('firenze') ||
      lower.includes('bologna') ||
      lower.includes('venezia') ||
      lower.includes('italia')
    );
  }

  /**
   * Finds the best geocoding result from a list, validating confidence and address components.
   * Throws a validation error if no suitable result is found.
   */
  private findBestResult(results: any[], originalAddress: string): any | null {
    // Parse the original address components
    const addressParts = this.parseAddress(originalAddress);
    let validationErrors: string[] = [];

    for (const result of results) {
      // Check minimum confidence threshold
      if (result.confidence < 7) {
        validationErrors.push(`Low confidence (${result.confidence}/10)`);
        continue; // Skip low confidence results
      }

      // Validate address components match
      if (this.validateAddressMatch(result.components, addressParts)) {
        return result;
      } else {
        // Collect specific validation errors for better error messages
        const geocodedCity =
          result.components.city || result.components.town || result.components.village || '';
        const geocodedProvince = result.components.county || ''; // County is the Italian province

        if (
          geocodedCity &&
          addressParts.city &&
          !this.fuzzyMatch(geocodedCity, addressParts.city)
        ) {
          validationErrors.push(
            `City mismatch: found "${geocodedCity}" instead of "${addressParts.city}"`
          );
        }

        if (
          addressParts.province &&
          geocodedProvince &&
          !this.fuzzyMatch(geocodedProvince, addressParts.province)
        ) {
          if (this.checkKnownMismatches(geocodedCity, addressParts.province, geocodedProvince)) {
            validationErrors.push(
              `Invalid geographical combination: "${addressParts.city}" is not in the province of "${addressParts.province}"`
            );
          } else {
            validationErrors.push(
              `Province mismatch: found "${geocodedProvince}" instead of "${addressParts.province}"`
            );
          }
        }
      }
    }

    // If we have specific validation errors, include them in the error
    if (validationErrors.length > 0) {
      const errorDetail = validationErrors[0]; // Use the first (most relevant) error
      throw new Error(`VALIDATION_ERROR: ${errorDetail}. Please verify the entered address.`);
    }

    // If no perfect match, return highest confidence result above threshold
    const highConfidenceResults = results.filter((r) => r.confidence >= 8);
    if (highConfidenceResults.length > 0) {
      return highConfidenceResults[0]; // Already sorted by confidence
    }

    return null; // No acceptable result found
  }

  /**
   * Parses a comma-separated address string into street, city, and province parts.
   */
  private parseAddress(address: string): any {
    // Simple parsing - you might want to make this more sophisticated
    const parts = address.split(',').map((p) => p.trim());
    return {
      street: parts[0] || '',
      city: parts[1] || '',
      province: parts[2] || '',
    };
  }

  /**
   * Validates that geocoded address components match the input address parts (city, province, street).
   */
  private validateAddressMatch(components: any, addressParts: any): boolean {
    // Validate country is Italy
    if (components.country_code !== 'it') {
      return false;
    }

    // Extract city/town from components
    const geocodedCity = components.city || components.town || components.village || '';
    const geocodedProvince = components.county || ''; // County is the Italian province
    const geocodedRegion = components.state || components.state_district || ''; // State is the Italian region

    // Check if the main city matches (case insensitive)
    const cityMatch = this.fuzzyMatch(geocodedCity, addressParts.city);

    if (!cityMatch) {
      // console.log('City mismatch:', { geocoded: geocodedCity, input: addressParts.city });
      return false;
    }

    // For provinces, validate more strictly
    if (addressParts.province) {
      const provinceMatch =
        this.fuzzyMatch(geocodedProvince, addressParts.province) ||
        this.fuzzyMatch(geocodedRegion, addressParts.province);

      if (!provinceMatch) {
        // Check if it's a known mismatch case
        const knownMismatches = this.checkKnownMismatches(
          geocodedCity,
          addressParts.province,
          geocodedProvince
        );
        if (knownMismatches) {
          // console.log('Known geographical mismatch detected');
          return false;
        }

        // console.log('Province mismatch:', {
        //   geocoded: { province: geocodedProvince, region: geocodedRegion },
        //   input: addressParts.province
        // });
        return false;
      }
    }

    // Street validation (check if road exists in components)
    const hasStreet = components.road || components.house_number;
    if (!hasStreet) {
      // console.log('Missing street information');
      return false;
    }

    return true;
  }

  /**
   * Checks for known geographical mismatches between city and province.
   */
  private checkKnownMismatches(
    geocodedCity: string,
    inputProvince: string,
    geocodedProvince: string
  ): boolean {
    // Define known geographical mismatches
    const mismatches: { [key: string]: string[] } = {
      firenze: ['milano', 'milan'],
      rome: ['milano', 'milan'],
      roma: ['milano', 'milan'],
      napoli: ['milano', 'milan'],
      naples: ['milano', 'milan'],
      torino: ['roma', 'rome'],
      turin: ['roma', 'rome'],
      palermo: ['milano', 'milan', 'roma', 'rome'],
      catania: ['milano', 'milan', 'roma', 'rome'],
    };

    const cityLower = geocodedCity.toLowerCase();
    const provinceLower = inputProvince.toLowerCase();

    if (mismatches[cityLower]) {
      return mismatches[cityLower].includes(provinceLower);
    }

    // Check if the geocoded county (province) is completely different from input
    const majorProvinces: { [key: string]: string[] } = {
      milano: ['milan', 'mi'],
      roma: ['rome', 'rm'],
      napoli: ['naples', 'na'],
      torino: ['turin', 'to'],
      firenze: ['florence', 'fi'],
      bologna: ['bo'],
      venezia: ['venice', 've'],
    };

    const inputProvinceLower = inputProvince.toLowerCase();
    const geocodedProvinceLower = geocodedProvince.toLowerCase();

    for (const [province, aliases] of Object.entries(majorProvinces)) {
      if (inputProvinceLower.includes(province)) {
        // If input contains a major province name, check if geocoded result matches
        const isInSameProvince =
          aliases.some((alias) => geocodedProvinceLower.includes(alias.toLowerCase())) ||
          geocodedProvinceLower.includes(province);
        if (!isInSameProvince) {
          return true; // It's a mismatch
        }
      }
    }

    return false;
  }

  /**
   * Performs a fuzzy match between two strings, allowing for minor typos and partial matches.
   */
  private fuzzyMatch(str1: string, str2: string): boolean {
    if (!str1 || !str2) return false;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return true;

    // Check if one contains the other (for cases like "Milano" vs "Milan")
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Levenshtein distance for typos (max 2 character difference)
    return this.levenshteinDistance(s1, s2) <= 2;
  }

  /**
   * Calculates the Levenshtein distance between two strings (number of edits required to transform one into the other).
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

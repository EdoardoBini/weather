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
    let addressForQuery = address;
    // Remove the second word if it is a road type, even if not a duplicate (e.g., 'Via Viale Antonio Gramsci' -> 'Via Antonio Gramsci')
    const parts = address.split(',');
    if (parts.length > 0) {
      const street = parts[0].trim();
      const streetWords = street.split(/\s+/);
      // Common Italian road types
      const roadTypes = [
        'via',
        'viale',
        'piazza',
        'corso',
        'largo',
        'vicolo',
        'strada',
        'piazzale',
      ];
      if (
        streetWords.length > 2 &&
        roadTypes.includes(streetWords[0].toLowerCase()) &&
        roadTypes.includes(streetWords[1].toLowerCase())
      ) {
        // Remove the second road type (even if not a duplicate)
        streetWords.splice(1, 1);
        parts[0] = streetWords.join(' ');
        addressForQuery = parts.join(', ');
      } else if (
        streetWords.length > 2 &&
        roadTypes.includes(streetWords[0].toLowerCase()) &&
        streetWords[0].toLowerCase() === streetWords[1].toLowerCase()
      ) {
        // Remove the duplicated road type (legacy case)
        streetWords.splice(0, 1);
        parts[0] = streetWords.join(' ');
        addressForQuery = parts.join(', ');
      }
    }
    let url: string;
    // console.log('Geocoding address:', addressForQuery, 'with country code:', countryCode);
    if (countryCode) {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        addressForQuery
      )}&key=${apiKey}&countrycode=${countryCode}&limit=15`;
    } else if (this.isLikelyItalianAddress(addressForQuery)) {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        addressForQuery
      )}&key=${apiKey}&countrycode=it&language=it&limit=5`;
    } else {
      url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
        addressForQuery
      )}&key=${apiKey}&limit=15`;
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
              throw new Error('VALIDATION_ERROR: Invalid or not found address. Please try again.');
            }
          } catch (error: any) {
            // If findBestResult threw a specific validation error, re-throw it
            if (error.message?.startsWith('VALIDATION_ERROR:')) {
              throw error;
            } else {
              throw new Error('VALIDATION_ERROR: Invalid or not found address. Please try again.');
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

  /**
   * Removes the road type (e.g., 'Via', 'Viale', 'Piazza', etc.) from the beginning of a road name.
   */
  private stripRoadType(road: string): string {
    if (!road) return '';
    // Common Italian road types
    const roadTypes = ['via', 'viale', 'piazza', 'corso', 'largo', 'vicolo', 'strada', 'piazzale'];
    let normalized = road.trim().toLowerCase();
    for (const type of roadTypes) {
      if (normalized.startsWith(type + ' ')) {
        return normalized.substring(type.length + 1).trim();
      }
    }
    return normalized;
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
    // Prefer result with postcode matching the input, then road name, otherwise allow valid road/square if postcode is not provided
    const addressParts = this.parseAddress(originalAddress);
    if (results && results.length > 0) {
      // Discard results without road or square attribute
      const filteredResults = results.filter(
        (r) => r.components && (r.components.road || r.components.square)
      );
      // If postcode is provided, try to match both postcode and road
      if (addressParts.postcode) {
        // First, try to match both postcode and road
        if (addressParts.street) {
          const exactPostcodeAndRoad = filteredResults.find(
            (r) =>
              r.components &&
              r.components.postcode &&
              r.components.postcode === addressParts.postcode &&
              r.components.road &&
              this.fuzzyMatch(r.components.road, addressParts.street)
          );
          if (exactPostcodeAndRoad) return exactPostcodeAndRoad;
        }
        // Fallback: match only postcode
        const exactPostcode = filteredResults.find(
          (r) =>
            r.components && r.components.postcode && r.components.postcode === addressParts.postcode
        );
        if (exactPostcode) return exactPostcode;
        // If no result with matching postcode, throw error
        throw new Error(
          `VALIDATION_ERROR: No result found with postcode ${addressParts.postcode} and a valid road or square. Please verify the entered address.`
        );
      } else if (addressParts.street) {
        // Remove road type from both input and result for comparison
        const inputStreetStripped = this.stripRoadType(addressParts.street);
        if (addressParts.city) {
          const cityMatchStrict = (geoName: string, inputName: string) => {
            if (!geoName || !inputName) return false;
            const geoWords = geoName.toLowerCase().trim().split(/\s+/);
            const inputWords = inputName.toLowerCase().trim().split(/\s+/);
            // If input is a prefix at word boundary, allow only if both have same number of words or input is a full prefix
            if (geoWords.length > inputWords.length) {
              // Only allow if input is a prefix of geoName at word boundary
              if (geoWords.slice(0, inputWords.length).join(' ') === inputWords.join(' ')) {
                return false; // Do not allow partial prefix (e.g., 'Monterotondo' in 'Monterotondo Marittimo')
              }
              return false;
            }
            return this.fuzzyMatch(geoName, inputName);
          };
          const roadAndCityMatch = filteredResults.find(
            (r) =>
              r.components &&
              r.components.road &&
              this.fuzzyMatch(this.stripRoadType(r.components.road), inputStreetStripped) &&
              ((r.components.city && cityMatchStrict(r.components.city, addressParts.city)) ||
                (r.components.town && cityMatchStrict(r.components.town, addressParts.city)) ||
                (r.components.village &&
                  cityMatchStrict(r.components.village, addressParts.city)) ||
                (r.components.hamlet && cityMatchStrict(r.components.hamlet, addressParts.city)))
          );
          if (roadAndCityMatch) return roadAndCityMatch;
          // Suggest the closest city found in the results for the same road
          const roadMatches = filteredResults.filter(
            (r) =>
              r.components &&
              r.components.road &&
              this.fuzzyMatch(this.stripRoadType(r.components.road), inputStreetStripped)
          );
          let suggestion = '';
          if (roadMatches.length > 0) {
            // Try to suggest the city/town/village/hamlet of the first road match
            const c = roadMatches[0].components;
            const suggestedCity = c.city || c.town || c.village || c.hamlet || '';
            if (suggestedCity && suggestedCity.toLowerCase() !== addressParts.city.toLowerCase()) {
              suggestion = ` Did you mean \"${addressParts.street}, ${suggestedCity}\"?`;
            }
          }
          // Suggest to add a postcode if not present
          let postcodeSuggestion = '';
          if (!addressParts.postcode) {
            postcodeSuggestion = ' Try adding a postcode to improve accuracy.';
          }
          throw new Error(
            `VALIDATION_ERROR: No result found with street name \"${addressParts.street}\" and city \"${addressParts.city}\".${suggestion}${postcodeSuggestion} Please verify the entered address.`
          );
        }
        // Fallback: try to match road only (only if city is not specified)
        const roadMatch = filteredResults.find(
          (r) =>
            r.components &&
            r.components.road &&
            this.fuzzyMatch(this.stripRoadType(r.components.road), inputStreetStripped)
        );
        if (roadMatch) return roadMatch;
        // If no road matches, throw a validation error
        throw new Error(
          `VALIDATION_ERROR: No result found with street name "${addressParts.street}". Please verify the entered address and insert the postcode if not present.`
        );
      } else {
        // No postcode or street: return first with valid road or square
        if (filteredResults.length > 0) return filteredResults[0];
      }
    }

    // console.log('originalAddress', originalAddress);
    let validationErrors: string[] = [];

    // Collect all valid results with their match score
    const validResults: { result: any; score: number }[] = [];

    for (const result of results) {
      if (result.confidence < 9) {
        validationErrors.push(`Low confidence (${result.confidence}/10)`);
        continue;
      }

      const countryCode = result.components.country_code;
      let matchScore = 0;
      let isValid = false;

      if (countryCode && countryCode.toLowerCase() !== 'it') {
        const geocodedCity =
          result.components.city || result.components.town || result.components.village || '';
        const geocodedPostcode = result.components.postcode || '';
        const geocodedCounty = result.components.county || '';
        const inputPostcode = addressParts.postcode || '';
        const inputCounty = addressParts.county || '';

        // Only validate city if both are present
        if (geocodedCity && addressParts.city) {
          if (this.fuzzyMatch(geocodedCity, addressParts.city)) {
            matchScore++;
          } else {
            validationErrors.push(
              `City mismatch: found \"${geocodedCity}\" instead of \"${addressParts.city}\"`
            );
            continue;
          }
        }

        // Validate postcode if both are present
        if (inputPostcode && geocodedPostcode) {
          if (geocodedPostcode.toLowerCase() === inputPostcode.toLowerCase()) {
            matchScore++;
          } else {
            validationErrors.push(
              `Postcode mismatch: found \"${geocodedPostcode}\" instead of \"${inputPostcode}\"`
            );
            continue;
          }
        }

        // Validate county if both are present
        if (inputCounty && geocodedCounty) {
          if (this.fuzzyMatch(geocodedCounty, inputCounty)) {
            matchScore++;
          } else {
            validationErrors.push(
              `County mismatch: found \"${geocodedCounty}\" instead of \"${inputCounty}\"`
            );
            continue;
          }
        }

        // If either city, postcode, or county is missing in input or result, skip that validation
        isValid = true;
      } else {
        // Italy: validate address components match
        try {
          if (this.validateAddressMatch(result.components, addressParts)) {
            // Score for each matching component
            const geocodedCity =
              result.components.city || result.components.town || result.components.village || '';
            const geocodedProvince = result.components.county || '';
            if (this.fuzzyMatch(geocodedCity, addressParts.city)) matchScore++;
            if (addressParts.province && this.fuzzyMatch(geocodedProvince, addressParts.province))
              matchScore++;
            if (
              addressParts.postcode &&
              result.components.postcode &&
              result.components.postcode === addressParts.postcode
            )
              matchScore++;
            isValid = true;
          } else {
            // Collect specific validation errors for better error messages
            const geocodedCity =
              result.components.city || result.components.town || result.components.village || '';
            const geocodedProvince = result.components.county || '';
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
              if (
                this.checkKnownMismatches(geocodedCity, addressParts.province, geocodedProvince)
              ) {
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
        } catch (e: any) {
          // If postcode mismatch throws, treat as invalid
          validationErrors.push(e.message);
        }
      }

      if (isValid) {
        validResults.push({ result, score: matchScore + result.confidence });
      }
    }

    if (validResults.length > 0) {
      // Sort by score (confidence + matchScore), descending
      validResults.sort((a, b) => b.score - a.score);
      return validResults[0].result;
    }

    // If we have specific validation errors, include them in the error
    if (validationErrors.length > 0) {
      const errorDetail = validationErrors[0]; // Use the first (most relevant) error
      throw new Error(`VALIDATION_ERROR: ${errorDetail}. Please verify the entered address.`);
    }

    // If no perfect match, return highest confidence result above threshold
    const highConfidenceResults = results.filter((r) => r.confidence >= 8);
    // console.log('High confidence results:', highConfidenceResults);
    if (highConfidenceResults.length > 0) {
      return highConfidenceResults[0];
    }

    return null; // No acceptable result found
  }

  /**
   * Parses a comma-separated address string into street, city, and province parts.
   */
  private parseAddress(address: string): any {
    // Simple parsing - you might want to make this more sophisticated
    const parts = address.split(',').map((p) => p.trim());
    // Remove duplicated or consecutive road type if present in the street part (e.g., 'Via Via Roma' or 'Via Viale Antonio Gramsci')
    if (parts.length > 0) {
      const street = parts[0];
      const streetWords = street.split(/\s+/);
      const roadTypes = [
        'via',
        'viale',
        'piazza',
        'corso',
        'largo',
        'vicolo',
        'strada',
        'piazzale',
      ];
      if (
        streetWords.length > 2 &&
        roadTypes.includes(streetWords[0].toLowerCase()) &&
        roadTypes.includes(streetWords[1].toLowerCase())
      ) {
        // Remove the second road type (even if not a duplicate)
        streetWords.splice(1, 1);
        parts[0] = streetWords.join(' ');
      } else if (
        streetWords.length > 2 &&
        roadTypes.includes(streetWords[0].toLowerCase()) &&
        streetWords[0].toLowerCase() === streetWords[1].toLowerCase()
      ) {
        // Remove the duplicated road type (legacy case)
        streetWords.splice(0, 1);
        parts[0] = streetWords.join(' ');
      }
    }

    // Extract postcode from any part (Italian postcodes are 5 digits)
    let postcode = '';
    const postcodeRegex = /\b\d{5}\b/;
    for (const part of parts) {
      const match = part.match(postcodeRegex);
      if (match) {
        postcode = match[0];
        break;
      }
    }

    let result: any = {};
    if (parts.length === 4) {
      // street, city, county/province, postcode (only if last part is a valid postcode)
      const lastIsPostcode = postcodeRegex.test(parts[3]);
      result = {
        street: parts[0] || '',
        city: parts[1] || '',
        province: parts[2] || '',
        county: parts[2] || '',
        postcode: postcode || (lastIsPostcode ? parts[3] : ''),
      };
    } else if (parts.length === 3) {
      // street, city, province/county or postcode (only if last part is a valid postcode)
      const lastIsPostcode = postcodeRegex.test(parts[2]);
      result = {
        street: parts[0] || '',
        city: parts[1] || '',
        province: lastIsPostcode ? '' : parts[2] || '',
        county: lastIsPostcode ? '' : parts[2] || '',
        postcode: postcode || (lastIsPostcode ? parts[2] : ''),
      };
    } else if (parts.length === 5) {
      // Non-Italian: country, address, city, county, postalcode (only if last part is a valid postcode)
      const lastIsPostcode = postcodeRegex.test(parts[4]);
      result = {
        country: parts[0] || '',
        street: parts[1] || '',
        city: parts[2] || '',
        county: parts[3] || '',
        postcode: postcode || (lastIsPostcode ? parts[4] : ''),
      };
    } else if (parts.length === 4) {
      // Non-Italian: address, city, county, postalcode (only if last part is a valid postcode)
      const lastIsPostcode = postcodeRegex.test(parts[3]);
      result = {
        street: parts[0] || '',
        city: parts[1] || '',
        county: parts[2] || '',
        postcode: postcode || (lastIsPostcode ? parts[3] : ''),
      };
    } else if (parts.length === 3) {
      // Non-Italian: address, city, postalcode (only if last part is a valid postcode)
      const lastIsPostcode = postcodeRegex.test(parts[2]);
      result = {
        street: parts[0] || '',
        city: parts[1] || '',
        postcode: postcode || (lastIsPostcode ? parts[2] : ''),
      };
    } else {
      // fallback for other cases
      result = {
        street: parts[0] || '',
        city: parts[1] || '',
        province: parts[2] || '',
        county: parts[2] || '',
        postcode: postcode || '',
      };
    }
    // console.log('Parsed address parts:', result);
    return result;
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
    const geocodedPostcode = components.postcode || '';

    // Check if the main city matches (case insensitive)
    const cityMatch = this.fuzzyMatch(geocodedCity, addressParts.city);
    if (!cityMatch) {
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
          return false;
        }
        return false;
      }
    }

    // Postcode validation (if both present)
    if (addressParts.postcode && geocodedPostcode) {
      // console.log(
      //   '🔍 Postcode validation - Input:',
      //   addressParts.postcode,
      //   'Geocoded:',
      //   geocodedPostcode
      // );
      if (geocodedPostcode !== addressParts.postcode) {
        // console.log('❌ Postcode mismatch detected!');
        // Instead of returning false, throw a specific error for postcode mismatch
        throw new Error(
          `VALIDATION_ERROR: Postcode mismatch: found "${geocodedPostcode}" instead of "${addressParts.postcode}". Please verify the entered address.`
        );
      } else {
        // console.log('✅ Postcode validation passed');
      }
    } else {
      // console.log(
      //   'ℹ️ Postcode validation skipped - Input postcode:',
      //   addressParts.postcode,
      //   'Geocoded postcode:',
      //   geocodedPostcode
      // );
    }

    // // Street validation (check if road exists in components)
    // const hasStreet = components.road || components.house_number;
    // if (!hasStreet) {
    //   return false;
    // }

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

    // Stricter city/village match: only allow substring if both are single words or input is a substring at word boundary
    const s1Words = s1.split(/\s+/);
    const s2Words = s2.split(/\s+/);
    if (s1Words.length === s2Words.length && (s1.includes(s2) || s2.includes(s1))) {
      return true;
    }
    if (
      (s2.startsWith(s1 + ' ') || s1.startsWith(s2 + ' ')) &&
      (s1Words.length > 1 || s2Words.length > 1)
    ) {
      return true;
    }

    // Levenshtein distance for typos (max 2 character difference), but only if same number of words
    if (s1Words.length === s2Words.length && this.levenshteinDistance(s1, s2) <= 2) {
      return true;
    }

    return false;
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

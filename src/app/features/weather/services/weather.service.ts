import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  WeatherDisplayData,
  OpenMeteoForecastResponse,
  OpenMeteoHistoricalResponse,
  LocationInfo,
  CurrentWeatherData,
  HourlyWeatherData,
} from '../../../shared/interfaces';

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  private readonly baseUrl = 'https://api.open-meteo.com/v1';

  constructor(private http: HttpClient) {}

  /**
   * Fetches the current weather data for the given latitude and longitude.
   */
  getCurrentWeather(lat: number, lon: number): Observable<WeatherDisplayData> {
    const url = `${this.baseUrl}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure&timezone=auto`;

    return this.http.get<OpenMeteoForecastResponse>(url).pipe(
      map((response) => {
        if (!response) {
          throw new Error('NO_DATA: No weather data available for this location.');
        }

        // Ensure we have current data
        const currentData = response.current || {
          time: new Date().toISOString(),
          temperature_2m: 0,
          relative_humidity_2m: 50,
          wind_speed_10m: 0,
          wind_direction_10m: 0,
          surface_pressure: 1013,
          interval: 3600,
        };

        return {
          location: {
            lat: response.latitude,
            lon: response.longitude,
            timezone: response.timezone,
          },
          current: {
            temp_c: currentData.temperature_2m,
            humidity: currentData.relative_humidity_2m,
            wind_kph: currentData.wind_speed_10m * 3.6, // Convert m/s to km/h
            wind_dir: currentData.wind_direction_10m,
            pressure_mb: currentData.surface_pressure,
            time: currentData.time,
          },
        };
      }),
      catchError((error: any) => {
        if (error.message?.startsWith('NO_DATA:')) {
          throw error;
        }
        return this.handleWeatherError(error, 'current weather data');
      })
    );
  }

  /**
   * Fetches historical weather data for a specific date and location.
   */
  getHistoricalWeather(lat: number, lon: number, date: string): Observable<WeatherDisplayData> {
    const url = `${this.baseUrl}/historical?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure&timezone=auto`;

    return this.http.get<OpenMeteoHistoricalResponse>(url).pipe(
      map((response) => {
        if (!response) {
          throw new Error('NO_DATA: No historical data available for this date.');
        }

        if (
          !response.hourly ||
          !response.hourly.temperature_2m ||
          response.hourly.temperature_2m.length === 0
        ) {
          throw new Error('NO_DATA: No historical data available for the selected date.');
        }

        return {
          location: {
            lat: response.latitude,
            lon: response.longitude,
            timezone: response.timezone,
          },
          current: {
            temp_c: response.hourly?.temperature_2m[12] || 0, // Use noon temperature
            humidity: 0, // Historical data structure differs
            wind_kph: 0,
            wind_dir: 0,
            pressure_mb: 0,
            time: date,
          },
          hourly: response.hourly,
        };
      }),
      catchError((error: any) => {
        if (error.message?.startsWith('NO_DATA:')) {
          throw error;
        }
        return this.handleWeatherError(error, 'historical weather data');
      })
    );
  }

  /**
   * Fetches weather forecast data (current and hourly) for the given location and number of days.
   */
  getForecastWeather(lat: number, lon: number, days: number = 3): Observable<WeatherDisplayData> {
    // Include both current weather and hourly forecast with proper alignment
    const url = `${this.baseUrl}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&forecast_days=${days}&timezone=auto`;

    return this.http.get<OpenMeteoForecastResponse>(url).pipe(
      map((response) => {
        if (!response) {
          throw new Error('NO_DATA: No forecast data available for this location.');
        }

        // Safely get current data or use first hourly data as fallback
        const currentData = response.current || {
          time: response.hourly?.time[0] || new Date().toISOString(),
          temperature_2m: response.hourly?.temperature_2m[0] || 0,
          relative_humidity_2m: response.hourly?.relative_humidity_2m[0] || 0,
          wind_speed_10m: response.hourly?.wind_speed_10m[0] || 0,
          wind_direction_10m: 0,
          surface_pressure: response.hourly?.surface_pressure[0] || 1013,
          interval: 3600,
        };

        // Find the current hour index in the hourly data
        const currentTime = new Date(currentData.time);
        const currentHourIndex = this.findCurrentHourIndex(
          response.hourly?.time || [],
          currentTime
        );

        return {
          location: {
            lat: response.latitude,
            lon: response.longitude,
            timezone: response.timezone,
          },
          current: {
            temp_c: currentData.temperature_2m,
            humidity: currentData.relative_humidity_2m,
            wind_kph: currentData.wind_speed_10m * 3.6, // Convert m/s to km/h
            wind_dir: currentData.wind_direction_10m,
            pressure_mb: currentData.surface_pressure,
            time: currentData.time,
          },
          hourly: response.hourly
            ? {
                time: response.hourly.time.slice(currentHourIndex),
                temperature_2m: response.hourly.temperature_2m.slice(currentHourIndex),
                relative_humidity_2m: response.hourly.relative_humidity_2m.slice(currentHourIndex),
                wind_speed_10m: response.hourly.wind_speed_10m.slice(currentHourIndex),
                surface_pressure: response.hourly.surface_pressure.slice(currentHourIndex),
              }
            : undefined,
        };
      }),
      catchError((error: any) => {
        if (error.message?.startsWith('NO_DATA:')) {
          throw error;
        }
        return this.handleWeatherError(error, 'forecast weather data');
      })
    );
  }

  /**
   * Finds the index of the current hour in the hourly time array.
   */
  private findCurrentHourIndex(hourlyTimes: string[], currentTime: Date): number {
    const currentHour = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      currentTime.getHours()
    );

    for (let i = 0; i < hourlyTimes.length; i++) {
      const hourlyTime = new Date(hourlyTimes[i]);
      const hourlyHour = new Date(
        hourlyTime.getFullYear(),
        hourlyTime.getMonth(),
        hourlyTime.getDate(),
        hourlyTime.getHours()
      );

      if (hourlyHour.getTime() >= currentHour.getTime()) {
        return i;
      }
    }

    return 0; // Fallback to first hour if no match found
  }

  /**
   * Handles and throws user-friendly errors for weather API requests.
   */
  private handleWeatherError(error: any, context: string): Observable<never> {
    console.error('Weather API error:', error);

    // Handle HTTP status errors
    if (error.status === 429) {
      throw new Error('API_ERROR: Too many requests. Please wait a moment before trying again.');
    } else if (error.status === 400) {
      throw new Error('VALIDATION_ERROR: Invalid coordinates or request parameters.');
    } else if (error.status === 404) {
      throw new Error('API_ERROR: Weather service not available for this location.');
    } else if (error.status >= 500) {
      throw new Error(
        'API_ERROR: Weather service temporarily unavailable. Please try again later.'
      );
    } else if (error.status === 0) {
      throw new Error('NETWORK_ERROR: Internet connection not available.');
    } else {
      throw new Error(`API_ERROR: Error retrieving ${context}. Please try again later.`);
    }
  }

  /**
   * Fetches yearly historical weather data for the previous year for the given location.
   */
  getYearlyHistoricalWeather(lat: number, lon: number): Observable<WeatherDisplayData> {
    // Use ERA5 archive endpoint which supports full year ranges
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const startDateStr = `${previousYear}-01-01`;
    const endDateStr = `${previousYear}-12-31`;

    // Use ERA5 archive endpoint for full year historical data
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat}&longitude=${lon}&start_date=${startDateStr}&end_date=${endDateStr}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&timezone=auto`;

    // console.log('Fetching ERA5 historical data from:', url);

    return this.http.get<OpenMeteoHistoricalResponse>(url).pipe(
      map((response) => {
        if (!response) {
          throw new Error('NO_DATA: No annual historical data available for this location.');
        }

        if (
          !response.hourly ||
          !response.hourly.temperature_2m ||
          response.hourly.temperature_2m.length === 0
        ) {
          throw new Error('NO_DATA: No annual historical data available for the previous year.');
        }

        return {
          location: {
            lat: response.latitude,
            lon: response.longitude,
            timezone: response.timezone,
          },
          current: {
            temp_c:
              response.hourly?.temperature_2m[response.hourly?.temperature_2m.length - 1] || 0,
            humidity:
              response.hourly?.relative_humidity_2m[
                response.hourly?.relative_humidity_2m.length - 1
              ] || 0,
            wind_kph:
              (response.hourly?.wind_speed_10m[response.hourly?.wind_speed_10m.length - 1] || 0) *
              3.6,
            wind_dir: 0,
            pressure_mb:
              response.hourly?.surface_pressure[response.hourly?.surface_pressure.length - 1] || 0,
            time: response.hourly?.time[response.hourly?.time.length - 1] || '',
          },
          hourly: response.hourly,
        };
      }),
      catchError((error: any) => {
        if (error.message?.startsWith('NO_DATA:')) {
          throw error;
        }
        // Special handling for ERA5 archive API which may have different error patterns
        if (error.status === 422) {
          throw new Error('VALIDATION_ERROR: Date range not supported for annual historical data.');
        }
        return this.handleWeatherError(error, 'annual historical weather data');
      })
    );
  }
}

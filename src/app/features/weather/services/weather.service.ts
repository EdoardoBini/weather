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
  /**
   * Downloads weather data as JSON based on date range, granularity, metrics, and mode.
   * @param weatherData The weather data object (forecast or historical)
   * @param startDate ISO string (YYYY-MM-DD)
   * @param endDate ISO string (YYYY-MM-DD)
   * @param granularity 'hourly' | 'daily' | 'weekly' | 'monthly'
   * @param metrics Array of metric keys to include (e.g., ['temperature_2m', 'humidity'])
   * @param isHistorical Boolean: true for historical, false for forecast
   */
  downloadWeatherDataAsJson(
    weatherData: any,
    startDate: string,
    endDate: string,
    granularity: 'hourly' | 'daily' | 'weekly' | 'monthly',
    metrics: string[],
    isHistorical: boolean
  ): void {
    if (!weatherData || !weatherData.hourly || !weatherData.hourly.time) return;

    // Helper to filter by date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const times: string[] = weatherData.hourly.time;
    const indexes: number[] = times
      .map((t, i) => {
        const d = new Date(t);
        return d >= start && d <= end ? i : -1;
      })
      .filter((i) => i !== -1);

    // Helper to aggregate by granularity
    function groupBy(arr: any[], keyFn: (t: string) => string) {
      const map: { [k: string]: number[] } = {};
      arr.forEach((t, i) => {
        const k = keyFn(t);
        if (!map[k]) map[k] = [];
        map[k].push(i);
      });
      return map;
    }

    let grouped: { [k: string]: number[] } = {};
    if (granularity === 'hourly') {
      grouped = times.reduce((acc, t, i) => {
        if (indexes.includes(i)) acc[t] = [i];
        return acc;
      }, {} as { [k: string]: number[] });
    } else if (granularity === 'daily') {
      grouped = groupBy(
        times.filter((_, i) => indexes.includes(i)),
        (t) => t.slice(0, 10)
      );
    } else if (granularity === 'weekly') {
      grouped = groupBy(
        times.filter((_, i) => indexes.includes(i)),
        (t) => {
          const d = new Date(t);
          const firstJan = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil(
            ((d.getTime() - firstJan.getTime()) / 86400000 + firstJan.getDay() + 1) / 7
          );
          return `${d.getFullYear()}-W${week}`;
        }
      );
    } else if (granularity === 'monthly') {
      grouped = groupBy(
        times.filter((_, i) => indexes.includes(i)),
        (t) => t.slice(0, 7)
      );
    }

    // Always flatten to a single object with arrays for time and each metric
    const out: any = { time: [] };
    metrics.forEach((metric) => {
      out[metric] = [];
    });
    Object.entries(grouped).forEach(([label, idxs]) => {
      out.time.push(label);
      metrics.forEach((metric) => {
        const arr = weatherData.hourly[metric];
        if (arr) {
          let value;
          if (granularity === 'hourly') {
            value = arr[idxs[0]];
          } else {
            const vals = idxs.map((i) => arr[i]).filter((v) => typeof v === 'number');
            value =
              vals.length > 0
                ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
                : null;
          }
          out[metric].push(value);
        } else {
          out[metric].push(null);
        }
      });
    });
    const dataStr = JSON.stringify([out], null, 2);

    // Compose file name
    const mode = isHistorical ? 'historical' : 'forecast';
    const fileName = `weather-${mode}-${startDate}_to_${endDate}-${granularity}.json`;

    // Download as JSON
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
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
  getForecastWeather(lat: number, lon: number, days: number = 14): Observable<WeatherDisplayData> {
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
                time: response.hourly.time,
                temperature_2m: response.hourly.temperature_2m,
                relative_humidity_2m: response.hourly.relative_humidity_2m,
                wind_speed_10m: response.hourly.wind_speed_10m,
                surface_pressure: response.hourly.surface_pressure,
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
      throw new Error('Too many requests. Please wait a moment before trying again.');
    } else if (error.status === 400) {
      throw new Error('Invalid coordinates or request parameters.');
    } else if (error.status === 404) {
      throw new Error('Weather service not available for this location.');
    } else if (error.status >= 500) {
      throw new Error('Weather service temporarily unavailable. Please try again later.');
    } else if (error.status === 0) {
      throw new Error('Internet connection not available.');
    } else {
      throw new Error(`Error retrieving ${context}. Please try again later.`);
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

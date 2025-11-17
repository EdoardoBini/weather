import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface AppConfig {
  production: boolean;
  opencageApiKey: string;
  apiBaseUrl?: string;
  mapTileUrl?: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private config: AppConfig | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Loads the application configuration from the server or returns cached config if already loaded.
   * Falls back to default config on error.
   */
  loadConfig(): Observable<AppConfig> {
    if (this.config) {
      return of(this.config);
    }

    return this.http.get<AppConfig>('/api/config').pipe(
      tap((config) => {
        this.config = config;
        // console.log('Configuration loaded:', config);
      }),
      catchError((error) => {
        console.error('Failed to load configuration, using defaults:', error);
        // Fallback to default configuration
        this.config = {
          production: false,
          opencageApiKey: '',
        };
        return of(this.config);
      })
    );
  }

  /**
   * Returns the currently loaded application configuration object, or null if not loaded.
   */
  getConfig(): AppConfig | null {
    return this.config;
  }

  /**
   * Retrieves a specific configuration value by key, with generic type support.
   */
  get<T>(key: keyof AppConfig): T | undefined {
    return this.config ? (this.config[key] as T) : undefined;
  }
}

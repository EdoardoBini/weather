import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  inject,
  DestroyRef,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { WeatherService } from '../services/weather.service';
import { WeatherChartComponent } from './weather-chart.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WeatherDisplayData, HourlyDataDisplay } from '../../../shared/interfaces';

@Component({
  selector: 'app-weather-info',
  standalone: true,
  imports: [CommonModule, WeatherChartComponent],
  templateUrl: './weather-info.component.html',
  styleUrls: ['./weather-info.component.scss'],
})
export class WeatherInfoComponent implements OnChanges {
  // Store the current hour and date in the searched place's timezone
  private placeCurrentHour: number | null = null;
  private placeCurrentDate: string | null = null;
  /**
   * Retry handler for error overlay
   */
  retryWeatherLoad(): void {
    this.error.set(null);
    this.loadWeatherData();
  }
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() address: string | null = null;
  @Input() chartWeatherData: WeatherDisplayData | null = null;
  @Output() errorOccurred = new EventEmitter<string>();

  // Inject dependencies using Angular's inject function
  private weatherService = inject(WeatherService);
  private destroyRef = inject(DestroyRef);

  // Reactive state using Angular signals
  weatherData = signal<WeatherDisplayData | null>(null);
  yearlyWeatherData = signal<WeatherDisplayData | null>(null);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  showSuccessToast = signal<boolean>(false);
  loadingYearly = signal<boolean>(false);

  // Computed properties for reactive data transformation
  hasWeatherData = computed(() => this.weatherData() !== null);
  isDataLoading = computed(() => this.loading() || this.loadingYearly());

  // Computed hourly data processing: start from the current hour
  hourlyDisplayData = computed(() => {
    const data = this.weatherData();
    if (!data?.hourly) return [];

    // Get the timezone from the weather data
    const tz = data.location?.timezone || undefined;
    // Get the current hour in the place's timezone
    let nowHour = null;
    let nowDate = null;
    try {
      const now = new Date();
      if (tz && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        // Use Intl to get the hour in the target timezone
        const parts = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          hour12: false,
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(now);
        const hourPart = parts.find((p) => p.type === 'hour');
        const dayPart = parts.find((p) => p.type === 'day');
        const monthPart = parts.find((p) => p.type === 'month');
        const yearPart = parts.find((p) => p.type === 'year');
        if (hourPart && dayPart && monthPart && yearPart) {
          nowHour = parseInt(hourPart.value, 10);
          nowDate = `${yearPart.value}-${monthPart.value}-${dayPart.value}`;
        }
      } else {
        nowHour = now.getHours();
        nowDate = now.toISOString().split('T')[0];
      }
    } catch {
      nowHour = new Date().getHours();
      nowDate = new Date().toISOString().split('T')[0];
    }

    // Store for use in isCurrentHour
    this.placeCurrentHour = nowHour;
    this.placeCurrentDate = nowDate;

    // Find the index of the first hour >= current hour in the place's timezone
    let startIdx = 0;
    for (let i = 0; i < data.hourly.time.length; i++) {
      const hourDate = new Date(data.hourly.time[i]);
      const hour = hourDate.getUTCHours();
      const dateStr = hourDate.toISOString().split('T')[0];
      // Convert hourDate to the place's timezone
      let localHour = hour;
      let localDateStr = dateStr;
      if (tz && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        const parts = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          hour12: false,
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(hourDate);
        const hourPart = parts.find((p) => p.type === 'hour');
        const dayPart = parts.find((p) => p.type === 'day');
        const monthPart = parts.find((p) => p.type === 'month');
        const yearPart = parts.find((p) => p.type === 'year');
        if (hourPart && dayPart && monthPart && yearPart) {
          localHour = parseInt(hourPart.value, 10);
          localDateStr = `${yearPart.value}-${monthPart.value}-${dayPart.value}`;
        }
      }
      if (localHour === nowHour && localDateStr === nowDate) {
        startIdx = i;
        break;
      }
    }

    const next12Hours: HourlyDataDisplay[] = [];
    const maxHours = Math.min(12, data.hourly.time.length - startIdx);

    for (let i = 0; i < maxHours; i++) {
      const idx = startIdx + i;
      if (
        data.hourly.time[idx] &&
        data.hourly.temperature_2m[idx] !== undefined &&
        data.hourly.relative_humidity_2m[idx] !== undefined &&
        data.hourly.wind_speed_10m[idx] !== undefined
      ) {
        next12Hours.push({
          time: this.formatTime(data.hourly.time[idx]),
          temperature: data.hourly.temperature_2m[idx],
          humidity: data.hourly.relative_humidity_2m[idx],
          windSpeed: data.hourly.wind_speed_10m[idx],
        });
      }
    }

    return next12Hours;
  });

  // Computed temperature range
  temperatureRange = computed(() => {
    const hourlyData = this.hourlyDisplayData();
    if (hourlyData.length === 0) return '';
    const temps = hourlyData.map((h) => h.temperature);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    return `${minTemp.toFixed(1)}° - ${maxTemp.toFixed(1)}°C`;
  });

  /**
   * Returns a generic emoji for a given temperature value.
   * ❄️ for cold (<= 5°C), 🌡️ for moderate (6–24°C), 🔥 for hot (>= 25°C)
   */
  getTemperatureEmoji(temp: number | undefined | null): string {
    if (temp == null || isNaN(Number(temp))) return '';
    const t = Number(temp);
    if (t <= 0) return '🥶'; // freezing
    if (t > 0 && t <= 11) return '❄️'; // cold
    if (t > 11 && t <= 18) return '🌤️'; // mild
    if (t > 18 && t <= 25) return '😎'; // warm
    if (t > 25 && t <= 32) return '🥵'; // hot
    if (t > 32) return '🔥'; // very hot
    return '🌡️';
  }

  // Computed weather condition
  weatherCondition = computed(() => {
    const hourlyData = this.hourlyDisplayData();
    if (hourlyData.length === 0) return '';

    const avgHumidity = hourlyData.reduce((sum, h) => sum + h.humidity, 0) / hourlyData.length;
    const avgWind = hourlyData.reduce((sum, h) => sum + h.windSpeed, 0) / hourlyData.length;

    if (avgHumidity > 80) return 'High humidity expected';
    if (avgWind > 15) return 'Windy conditions';
    return 'Moderate conditions';
  });

  // Computed current hour info
  currentHourInfo = computed(() => {
    return `Updated ${new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  });

  /**
   * Reacts to input changes (latitude/longitude) and loads weather data if needed.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['latitude'] || changes['longitude']) && this.latitude && this.longitude) {
      this.loadWeatherData();
    }
  }

  /**
   * Loads current weather data for the given latitude and longitude.
   */
  private loadWeatherData(): void {
    if (!this.latitude || !this.longitude) return;

    this.loading.set(true);
    this.error.set(null);

    this.weatherService
      .getForecastWeather(this.latitude, this.longitude)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: WeatherDisplayData) => {
          this.weatherData.set(data);
          this.loading.set(false);
        },
        error: (err: any) => {
          const errorMsg = this.parseWeatherError(err);
          this.error.set(errorMsg);
          this.errorOccurred.emit(errorMsg);
          this.loading.set(false);
          console.error('Weather data error:', err);
        },
      });
  }

  /**
   * Loads yearly historical weather data for the given latitude and longitude.
   */
  private loadYearlyWeatherData(): void {
    if (!this.latitude || !this.longitude) return;

    this.loadingYearly.set(true);

    this.weatherService
      .getYearlyHistoricalWeather(this.latitude, this.longitude)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: WeatherDisplayData) => {
          this.yearlyWeatherData.set(data);
          this.loadingYearly.set(false);
        },
        error: (err: any) => {
          const errorMsg = this.parseWeatherError(err);
          this.errorOccurred.emit(errorMsg);
          console.error('Yearly weather data error:', err);
          this.loadingYearly.set(false);
        },
      });
  }

  /**
   * Triggers loading of yearly weather data if not already loaded or loading.
   */
  onLoadYearlyData(): void {
    // Only load if not already loaded or loading
    if (!this.yearlyWeatherData() && !this.loadingYearly()) {
      this.loadYearlyWeatherData();
    }
  }

  /**
   * Downloads the current weather data as a JSON file.
   */
  downloadWeatherData(): void {
    if (!this.weatherData()) return;

    const dataStr = JSON.stringify(this.weatherData(), null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `weather-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    this.showSuccessMessage();
  }

  /**
   * Downloads the yearly historical weather data as a JSON file.
   */
  downloadYearlyData(): void {
    if (!this.latitude || !this.longitude) return;

    this.loadingYearly.set(true);
    const currentDate = new Date();
    const lastYear = new Date(
      currentDate.getFullYear() - 1,
      currentDate.getMonth(),
      currentDate.getDate()
    );
    const endDate = new Date(lastYear);
    endDate.setFullYear(endDate.getFullYear() + 1);

    this.weatherService
      .getYearlyHistoricalWeather(this.latitude, this.longitude)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: WeatherDisplayData) => {
          const dataStr = JSON.stringify(data, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);

          const link = document.createElement('a');
          link.href = url;
          link.download = `historical-weather-data-${lastYear.getFullYear()}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(url);
          this.loadingYearly.set(false);
          this.showSuccessMessage();
        },
        error: (err: any) => {
          const errorMsg = this.parseWeatherError(err);
          this.errorOccurred.emit(errorMsg);
          console.error('Historical weather data error:', err);
          this.loadingYearly.set(false);
        },
      });
  }

  /**
   * Shows a temporary success toast message after download.
   */
  private showSuccessMessage(): void {
    this.showSuccessToast.set(true);
    setTimeout(() => {
      this.showSuccessToast.set(false);
    }, 3000);
  }

  /**
   * Formats a time string to HH:mm format or returns the original string if invalid.
   */
  formatTime(timeString: string | undefined): string {
    if (!timeString) return '--:--';
    try {
      const date = new Date(timeString);
      // Use the place's timezone if available
      const tz = this.weatherData()?.location?.timezone;
      if (tz) {
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: tz,
        });
      }
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return timeString;
    }
  }

  // Template helper methods (delegate to computed properties)
  /**
   * Returns the next 12 hours of hourly weather data for display.
   */
  getNext12HoursData(): HourlyDataDisplay[] {
    return this.hourlyDisplayData();
  }

  /**
   * Returns true if the given hourData corresponds to the current hour.
   */
  isCurrentHour(hourData: HourlyDataDisplay): boolean {
    if (!hourData?.time || this.placeCurrentHour === null || this.placeCurrentDate === null)
      return false;
    // Try to parse hour and date from hourData.time (assumed format: 'HH:mm' or ISO string)
    let hourFromData: number | null = null;
    let dateFromData: string | null = null;
    // Try to parse as 'HH:mm' (today)
    const match = hourData.time.match(/^(\d{2}):(\d{2})/);
    if (match) {
      hourFromData = parseInt(match[1], 10);
      // Use the stored date for today
      dateFromData = this.placeCurrentDate;
    } else {
      // Try to parse as ISO string
      const date = new Date(hourData.time);
      if (!isNaN(date.getTime())) {
        hourFromData = date.getHours();
        dateFromData = date.toISOString().split('T')[0];
      }
    }
    if (hourFromData === null || dateFromData === null) return false;
    // Compare with the searched place's current hour and date
    return hourFromData === this.placeCurrentHour && dateFromData === this.placeCurrentDate;
  }

  /**
   * Returns the temperature range string for the next 12 hours.
   */
  getTemperatureRange(): string {
    return this.temperatureRange();
  }

  /**
   * Returns a string describing the weather condition based on humidity and wind.
   */
  getWeatherCondition(): string {
    return this.weatherCondition();
  }

  /**
   * Returns a string with the current update time.
   */
  getCurrentHourInfo(): string {
    return this.currentHourInfo();
  }

  /**
   * Returns an emoji representing the weather icon based on temperature and humidity.
   */
  getWeatherIcon(temp: number, humidity: number): string {
    if (temp < 0) return '❄️';
    if (temp < 10) return '🌨️';
    if (humidity > 80) return '🌧️';
    if (temp > 25) return '☀️';
    return '🌤️';
  }

  /**
   * Calculates the "feels like" temperature using a simple heat index formula.
   */
  getFeelsLike(temp: number, humidity: number): number {
    // Simple heat index calculation
    if (temp < 27) return temp;

    const hi =
      -8.78469475556 +
      1.61139411 * temp +
      2.33854883889 * humidity +
      -0.14611605 * temp * humidity +
      -0.012308094 * temp * temp +
      -0.0164248277778 * humidity * humidity +
      0.002211732 * temp * temp * humidity +
      0.00072546 * temp * humidity * humidity +
      -0.000003582 * temp * temp * humidity * humidity;

    return Math.round(hi);
  }

  /**
   * Parses and returns a user-friendly error message from a weather API error object.
   */
  private parseWeatherError(error: any): string {
    if (error.message) {
      if (error.message.startsWith('VALIDATION_ERROR:')) {
        return error.message.substring('VALIDATION_ERROR:'.length).trim();
      } else if (error.message.startsWith('NO_DATA:')) {
        return error.message.substring('NO_DATA:'.length).trim();
      } else if (error.message.startsWith('API_ERROR:')) {
        return error.message.substring('API_ERROR:'.length).trim();
      } else if (error.message.startsWith('NETWORK_ERROR:')) {
        return error.message.substring('NETWORK_ERROR:'.length).trim();
      } else {
        return 'Error occurred while loading weather data.';
      }
    } else {
      return 'Error occurred while loading weather data.';
    }
  }
}

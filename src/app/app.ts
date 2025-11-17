import {
  Component,
  signal,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NavbarComponent } from './shared/components';
import { AddressFormComponent } from './features/address-form/components';
import { LocationResult } from './shared/interfaces';
import { WeatherService } from './features/weather/services';
import { FormControlService } from './core/services';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, AddressFormComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  onFormChanged() {
    this.currentLocation = null;
    this.clearWeatherComponent();
    this.closeMapModal();
  }
  protected readonly title = signal('fervo-weather');

  currentLocation: LocationResult | null = null;
  error: string | null = null;
  showMapModal: boolean = false;
  private map: any = null;
  private modalMap: any = null;
  private marker: any = null;
  private modalMarker: any = null;
  private leaflet: typeof import('leaflet') | null = null;
  private isBrowser: boolean;
  weatherComponentRef: ComponentRef<any> | null = null;
  chartWeatherData: any = null;

  @ViewChild('resultsContainer', { read: ViewContainerRef }) resultsContainer!: ViewContainerRef;

  constructor(
    private weatherService: WeatherService,
    private formControlService: FormControlService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.loadLeaflet();
    }
  }

  private async loadLeaflet() {
    try {
      // Load Leaflet CSS dynamically only in browser
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
        document.head.appendChild(link);
      }

      const L = await import('leaflet');
      this.leaflet = L.default || L;

      // Fix Leaflet's default icon path issues
      delete (this.leaflet.Icon.Default.prototype as any)._getIconUrl;
      this.leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    } catch (error) {
      console.error('Error loading Leaflet:', error);
    }
  }

  onLocationFound(location: LocationResult) {
    this.currentLocation = location;
    this.error = null;
    setTimeout(() => {
      this.loadWeatherComponent();
    }, 100);
  }

  onError(error: string) {
    this.error = error;
  }

  clearError() {
    this.error = null;
  }

  async openMapModal() {
    if (!this.isBrowser) return;

    this.showMapModal = true;

    // Ensure Leaflet is loaded before showing the map
    if (!this.leaflet) {
      await this.loadLeaflet();
    }

    setTimeout(() => {
      this.showModalMap();
    }, 300);
  }

  closeMapModal() {
    this.showMapModal = false;
    if (this.modalMap) {
      this.modalMap.remove();
      this.modalMap = null;
      this.modalMarker = null;
    }
  }

  private showModalMap() {
    if (!this.isBrowser || !this.leaflet || !this.currentLocation) return;

    const mapContainer = document.getElementById('modal-map');
    if (!mapContainer) {
      console.warn('Map container not found');
      return;
    }

    const L = this.leaflet;
    const { latitude, longitude } = this.currentLocation;

    // Remove previous modal map instance if it exists
    if (this.modalMap) {
      this.modalMap.remove();
      this.modalMap = null;
      this.modalMarker = null;
    }

    // Use a custom SVG pin icon for the marker
    const customIcon = L.icon({
      iconUrl:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <path d="M16 2C10.477 2 6 6.477 6 12c0 6.627 7.163 15.197 9.197 17.297a1.5 1.5 0 0 0 2.206 0C18.837 27.197 26 18.627 26 12c0-5.523-4.477-10-10-10zm0 13.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="#1976d2" stroke="white" stroke-width="2"/>
            <circle cx="16" cy="12" r="3.5" fill="white"/>
          </svg>
        `),
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });

    // Initialize modal map inside the container
    this.modalMap = L.map(mapContainer).setView([latitude, longitude], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.modalMap);
    this.modalMarker = L.marker([latitude, longitude], { icon: customIcon }).addTo(this.modalMap);
    this.modalMarker
      .bindPopup(
        `${this.currentLocation.address}<br>Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(
          4
        )}`
      )
      .openPopup();

    // Ensure map renders properly in modal
    setTimeout(() => {
      this.modalMap.invalidateSize();
    }, 100);
  }

  private async loadWeatherComponent() {
    if (!this.isBrowser || !this.resultsContainer || !this.currentLocation) return;

    // Clear any existing weather component
    this.clearWeatherComponent();

    try {
      const { latitude, longitude } = this.currentLocation;

      // Fetch weather data for the chart
      this.weatherService.getForecastWeather(latitude, longitude, 7).subscribe({
        next: (data) => {
          this.chartWeatherData = data;
          // Update the chart data in the weather component if it exists
          if (this.weatherComponentRef) {
            this.weatherComponentRef.setInput('chartWeatherData', this.chartWeatherData);
          }
        },
        error: (error) => {
          console.error('Failed to fetch weather data for chart:', error);
        },
      });

      // Lazy load the weather component
      const { WeatherInfoComponent } = await import(
        './features/weather/components/weather-info.component'
      );

      // Create the component
      this.weatherComponentRef = this.resultsContainer.createComponent(WeatherInfoComponent);

      // Set the input properties
      this.weatherComponentRef.setInput('latitude', latitude);
      this.weatherComponentRef.setInput('longitude', longitude);
      this.weatherComponentRef.setInput('address', this.currentLocation.address);
      this.weatherComponentRef.setInput('chartWeatherData', this.chartWeatherData);

      // Subscribe to error events from the weather component
      this.weatherComponentRef.instance.errorOccurred.subscribe((error: string) => {
        this.onError(error);
      });
    } catch (error) {
      console.error('Failed to load weather component:', error);
    }
  }

  private clearWeatherComponent() {
    if (this.weatherComponentRef) {
      this.weatherComponentRef.destroy();
      this.weatherComponentRef = null;
    }
    if (this.resultsContainer) {
      this.resultsContainer.clear();
    }
    this.chartWeatherData = null;
  }

  clearResults() {
    this.currentLocation = null;
    this.clearWeatherComponent();
    this.closeMapModal(); // Close map modal if open

    // Clear the address form using the service
    this.formControlService.clearForm();
  }
}

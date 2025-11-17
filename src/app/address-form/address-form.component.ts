import {
  Component,
  AfterViewChecked,
  Inject,
  PLATFORM_ID,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeocodingService } from '../core/services/geocoding.service';
import { WeatherService } from '../features/weather/services/weather.service';
import { FormControlService } from '../core/services/form-control.service';
import { Subscription } from 'rxjs';
import { FieldName, LocationResult } from '../shared/interfaces';

@Component({
  selector: 'app-address-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `<div>Legacy address form - moved to features/address-form</div>`,
  styles: [
    `
      div {
        padding: 1em;
        color: #666;
      }
    `,
  ],
})
export class AddressFormComponent implements OnInit, OnDestroy {
  formModified: boolean = true;
  @Output() locationFound = new EventEmitter<LocationResult>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() formCleared = new EventEmitter<void>();
  @Output() formChanged = new EventEmitter<void>();

  activeTab: 'italian' | 'international' = 'italian';
  roadType: string = '';
  roadName: string = '';
  roadNumber: string = '';
  city: string = '';
  county: string = '';
  intlAddress: string = '';
  countryCode: string = '';
  error: string | null = null;

  private subscription: Subscription = new Subscription();

  touched: Record<string, boolean> = {
    roadType: false,
    roadName: false,
    roadNumber: false,
    city: false,
    county: false,
    intlAddress: false,
  };

  isInvalid(field: string): boolean {
    return this.touched[field] && !(this as any)[field];
  }

  onFieldChange(field: string) {
    this.touched[field] = true;
    // Clear error if user starts editing
    if (this.error) this.error = null;
    this.formModified = true;
    this.formChanged.emit();
  }

  constructor(
    private geocodingService: GeocodingService,
    private formControlService: FormControlService
  ) {}

  ngOnInit() {
    // Subscribe to clear form events
    this.subscription.add(
      this.formControlService.clearForm$.subscribe(() => {
        this.clearForm();
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  onSubmit() {
    this.error = null;
    Object.keys(this.touched).forEach((f) => (this.touched[f] = true));
    this.formModified = false;

    if (this.activeTab === 'italian') {
      if (
        this.isInvalid('roadType') ||
        this.isInvalid('roadName') ||
        this.isInvalid('roadNumber') ||
        this.isInvalid('city') ||
        this.isInvalid('county')
      ) {
        const errorMsg = 'Please fill in all required fields.';
        this.error = errorMsg;
        this.errorOccurred.emit(errorMsg);
        return;
      }
      const address = `${this.roadType} ${this.roadName} ${this.roadNumber}, ${this.city}, ${this.county}`;
      this.geocodingService.geocode(address).subscribe({
        next: (result: LocationResult | null) => {
          if (result) {
            this.error = '';
            this.locationFound.emit({
              latitude: result.latitude,
              longitude: result.longitude,
              address: address,
            });
          } else {
            const errorMsg = 'No results found.';
            this.error = errorMsg;
            this.errorOccurred.emit(errorMsg);
          }
        },
        error: (error: any) => {
          let errorMsg = '';
          if (error.message) {
            if (error.message.startsWith('VALIDATION_ERROR:')) {
              errorMsg = error.message.substring('VALIDATION_ERROR:'.length).trim();
            } else if (error.message.startsWith('NO_RESULTS:')) {
              errorMsg = error.message.substring('NO_RESULTS:'.length).trim();
            } else if (error.message.startsWith('API_ERROR:')) {
              errorMsg = error.message.substring('API_ERROR:'.length).trim();
            } else if (error.message.startsWith('NETWORK_ERROR:')) {
              errorMsg = error.message.substring('NETWORK_ERROR:'.length).trim();
            } else {
              errorMsg = 'Error occurred while searching for the location.';
            }
          } else {
            errorMsg = 'Error occurred while searching for the location.';
          }
          this.error = errorMsg;
          this.errorOccurred.emit(errorMsg);
        },
      });
    } else if (this.activeTab === 'international') {
      if (!this.intlAddress || !this.countryCode) {
        const errorMsg = 'Address and country are required.';
        this.error = errorMsg;
        this.errorOccurred.emit(errorMsg);
        return;
      }
      this.geocodingService.geocode(this.intlAddress, this.countryCode).subscribe({
        next: (result: LocationResult | null) => {
          if (result) {
            this.error = '';
            this.locationFound.emit({
              latitude: result.latitude,
              longitude: result.longitude,
              address: this.intlAddress,
            });
          } else {
            const errorMsg = 'No results found.';
            this.error = errorMsg;
            this.errorOccurred.emit(errorMsg);
          }
        },
        error: (error: any) => {
          let errorMsg = '';
          if (error.message) {
            if (error.message.startsWith('VALIDATION_ERROR:')) {
              errorMsg = error.message.substring('VALIDATION_ERROR:'.length).trim();
            } else if (error.message.startsWith('NO_RESULTS:')) {
              errorMsg = error.message.substring('NO_RESULTS:'.length).trim();
            } else if (error.message.startsWith('API_ERROR:')) {
              errorMsg = error.message.substring('API_ERROR:'.length).trim();
            } else if (error.message.startsWith('NETWORK_ERROR:')) {
              errorMsg = error.message.substring('NETWORK_ERROR:'.length).trim();
            } else {
              errorMsg = 'Error occurred while searching for the location.';
            }
          } else {
            errorMsg = 'Error occurred while searching for the location.';
          }
          this.error = errorMsg;
          this.errorOccurred.emit(errorMsg);
        },
      });
    }
  }

  clearError() {
    this.error = '';
  }

  clearForm() {
    this.roadType = '';
    this.roadName = '';
    this.roadNumber = '';
    this.city = '';
    this.county = '';
    this.intlAddress = '';
    this.countryCode = '';
    this.error = null;
    this.formModified = true;
    // Reset touched state for all fields
    this.touched = {
      roadType: false,
      roadName: false,
      roadNumber: false,
      city: false,
      county: false,
      intlAddress: false,
      countryCode: false,
    };
    // Emit the form cleared event
    this.formCleared.emit();
  }
}

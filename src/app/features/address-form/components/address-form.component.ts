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
import { GeocodingService } from '../../../core/services/geocoding.service';
import { WeatherService } from '../../weather/services/weather.service';
import { FormControlService } from '../../../core/services/form-control.service';
import { Subscription } from 'rxjs';
import {
  FieldName,
  LocationResult,
  AddressFormData,
  ValidationResult,
  FormFieldConfig,
} from '../../../shared/interfaces';

@Component({
  selector: 'app-address-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './address-form.component.html',
  styleUrls: ['./address-form.component.scss'],
})
export class AddressFormComponent implements OnInit, OnDestroy {
  isLoading: boolean = false;
  formModified: boolean = true;
  @Output() locationFound = new EventEmitter<LocationResult>();
  @Output() errorOccurred = new EventEmitter<string>();
  @Output() formCleared = new EventEmitter<void>();
  @Output() formChanged = new EventEmitter<void>();

  italianCountryCode: string = '';
  roadType: string = '';
  roadName: string = '';
  city: string = '';
  county: string = '';
  postalCode: string = '';
  error: string | null = null;

  private previousCountryCode: string = '';

  private isBrowser: boolean;
  private subscription: Subscription = new Subscription();

  touched: Record<string, boolean> = {
    italianCountryCode: false,
    roadType: false,
    roadName: false,
    city: false,
    county: false,
    postalCode: false,
  };

  /**
   * Checks if a form field is invalid based on its value and validation rules for the current tab.
   */
  isInvalid(field: string): boolean {
    if (field === 'postalCode') {
      if (!this.touched[field]) return false;
      if (this.italianCountryCode === 'it') {
        // Postcode is optional for Italy, only validate if present
        return !!this.postalCode && !this.isValidItalianPostalCode(this.postalCode);
      } else if (this.italianCountryCode) {
        // For other countries, only validate if non-empty and touched
        return !!this.postalCode && !/^[A-Za-z0-9 \-]+$/.test(this.postalCode);
      }
      return false;
    }
    if (field === 'roadName') {
      // Only allow letters, numbers, spaces, apostrophes, and dashes in Italian road names
      return (
        this.touched[field] &&
        (!this.roadName || !/^[A-Za-zÀ-ÿ0-9'\- ]+$/.test(this.roadName))
      );
    }
    if (field === 'city') {
      // Only allow letters, numbers, spaces, apostrophes, and dashes in Italian city
      return (
        this.touched[field] &&
        (!(this as any)[field] || !/^[A-Za-zÀ-ÿ0-9'\- ]+$/.test((this as any)[field]))
      );
    }
    if (field === 'county') {
      if (this.italianCountryCode === 'it') {
        // Optional for Italy, only validate if present
        return (
          this.touched[field] &&
          !!(this as any)[field] &&
          !/^[A-Za-zÀ-ÿ0-9'\- ]+$/.test((this as any)[field])
        );
      } else {
        // For other countries, only validate if non-empty and touched
        return (
          this.touched[field] &&
          !!(this as any)[field] &&
          !/^[A-Za-zÀ-ÿ0-9'\- ]+$/.test((this as any)[field])
        );
      }
    }
    return this.touched[field] && !(this as any)[field];
  }

  /**
   * Validates that the Italian postal code is exactly 5 digits.
   */
  isValidItalianPostalCode(postalCode: string): boolean {
    if (!postalCode) return false;
    // Italian postal codes are exactly 5 digits
    return /^\d{5}$/.test(postalCode);
  }

  /**
   * Prevents non-numeric input in the postal code field.
   */
  onPostalCodeKeypress(event: KeyboardEvent): void {
    // Only allow numeric input
    const charCode = event.charCode;
    if (charCode < 48 || charCode > 57) {
      event.preventDefault();
    }
  }

  /**
   * Handles changes to form fields, updates touched state, and clears errors as needed.
   */
  onFieldChange(field: string) {
    this.touched[field] = true;
    // Clear error if user starts editing
    if (this.error) this.error = null;
    this.formModified = true;
    this.formChanged.emit();
    // If country changes, reset all touched states and clear errors
    if (field === 'italianCountryCode') {
      Object.keys(this.touched).forEach((key) => (this.touched[key] = false));
      this.error = null;
      // Only reset if changing from a non-empty value to another non-empty value
      if (this.previousCountryCode && this.italianCountryCode && this.previousCountryCode !== this.italianCountryCode) {
        this.roadType = '';
        this.roadName = '';
        this.city = '';
        this.county = '';
        this.postalCode = '';
      }
      this.previousCountryCode = this.italianCountryCode;
    } else {
      // Clear error if user starts editing
      if (this.error) this.error = null;
    }
    this.formModified = true;
    this.formChanged.emit();
  }

  constructor(
    private geocodingService: GeocodingService,
    private formControlService: FormControlService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /**
   * Initializes the component and subscribes to form clear events.
   */
  ngOnInit() {
    // Subscribe to clear form events
    this.subscription.add(
      this.formControlService.clearForm$.subscribe(() => {
        this.clearForm();
      })
    );
  }

  /**
   * Cleans up subscriptions when the component is destroyed.
   */
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  /**
   * Handles form submission, validates fields, and triggers geocoding lookup.
   */
  onSubmit() {
    this.isLoading = true;
    this.error = null;
    Object.keys(this.touched).forEach((f) => (this.touched[f] = true));
    this.formModified = false;

    if (
      this.isInvalid('italianCountryCode') ||
      (this.italianCountryCode === 'it' && this.isInvalid('roadType')) ||
      this.isInvalid('roadName') ||
      this.isInvalid('city') ||
      (this.italianCountryCode === 'it' && this.isInvalid('county')) ||
      (this.italianCountryCode && this.italianCountryCode !== 'it' && !!this.postalCode && this.isInvalid('postalCode'))
    ) {
      let errorMsg = '';
      if (this.isInvalid('roadName')) {
        errorMsg = !this.roadName ? 'Address name is required.' : 'Address name: no special characters allowed.';
      } else if (this.isInvalid('city')) {
        errorMsg = !this.city ? 'City is required.' : 'City: no special characters allowed.';
      } else if (this.italianCountryCode === 'it' && this.isInvalid('county')) {
        errorMsg = 'County: no special characters allowed.';
      } else if (this.italianCountryCode && this.italianCountryCode !== 'it' && !!this.postalCode && this.isInvalid('postalCode')) {
        errorMsg = 'Invalid postcode format.';
      } else {
        errorMsg = this.italianCountryCode === 'it'
          ? 'Please fill in all required fields.'
          : 'Country, road name and city are required.';
      }
      this.error = errorMsg;
      this.errorOccurred.emit(errorMsg);
      return;
    }

    let address = '';
    if (this.italianCountryCode === 'it') {
      // Full Italian format (no house number)
      const roadTypePrefix = this.roadType ? `${this.roadType} ` : '';
      // Remove county if equal to city (case-insensitive)
      const countyToUse = (this.county && this.city && this.county.trim().toLowerCase() === this.city.trim().toLowerCase()) ? '' : this.county;
      if (countyToUse && this.postalCode) {
        address = `${roadTypePrefix}${this.roadName}, ${this.city}, ${countyToUse}, ${this.postalCode}`;
      } else if (countyToUse) {
        address = `${roadTypePrefix}${this.roadName}, ${this.city}, ${countyToUse}`;
      } else if (this.postalCode) {
        address = `${roadTypePrefix}${this.roadName}, ${this.city}, ${this.postalCode}`;
      } else {
        address = `${roadTypePrefix}${this.roadName}, ${this.city}`;
      }
    } else {
      // For other countries, include county if present
      if (this.county) {
        address = `${this.roadName}, ${this.city}, ${this.county}, ${this.postalCode}`;
      } else {
        address = `${this.roadName}, ${this.city}, ${this.postalCode}`;
      }
    }

    this.geocodingService.geocode(address, this.italianCountryCode).subscribe({
      next: (result: LocationResult | null) => {
        if (result) {
          this.error = '';
          this.locationFound.emit({
            latitude: result.latitude,
            longitude: result.longitude,
            address: result.address,
            postcode: result.postcode || this.postalCode,
          });
          this.isLoading = false;
        } else {
          const errorMsg = 'No results found.';
          this.error = errorMsg;
          this.errorOccurred.emit(errorMsg);
          this.isLoading = false;
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
        this.isLoading = false;
      },
    });
  }

  /**
   * Clears the current error message.
   */
  clearError() {
    this.error = '';
  }

  /**
   * Resets all form fields and touched states, and emits the form cleared event.
   */
  clearForm() {
    this.italianCountryCode = '';
    this.roadType = '';
    this.roadName = '';
    this.city = '';
    this.county = '';
    this.postalCode = '';
    this.error = null;
    this.formModified = true;
    // Reset touched state for all fields
    this.touched = {
      italianCountryCode: false,
      roadType: false,
      roadName: false,
      city: false,
      county: false,
      postalCode: false,
    };
    // Emit the form cleared event
    this.formCleared.emit();
  }
}

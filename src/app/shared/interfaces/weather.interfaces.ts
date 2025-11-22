// Comprehensive TypeScript interfaces for Weather Application
// This file provides detailed type definitions for all data structures,
// API responses, and component properties to improve type safety

// =============================================================================
// CORE DATA INTERFACES
// =============================================================================

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface LocationInfo extends Coordinates {
  timezone: string;
  name?: string;
  country?: string;
  region?: string;
}

// =============================================================================
// WEATHER DATA INTERFACES
// =============================================================================

export interface CurrentWeatherData {
  time: string;
  temp_c: number;
  humidity: number;
  wind_kph: number;
  wind_dir: number;
  pressure_mb: number;
  feels_like_c?: number;
  uv_index?: number;
  visibility_km?: number;
  condition?: WeatherCondition;
}

export interface WeatherCondition {
  text: string;
  icon: string;
  code: number;
}

export interface HourlyWeatherData {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  wind_speed_10m: number[];
  surface_pressure: number[];
  precipitation?: number[];
  wind_direction_10m?: number[];
}

export interface DailyWeatherData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  wind_direction_10m_dominant: number[];
}

// =============================================================================
// API RESPONSE INTERFACES
// =============================================================================

export interface OpenMeteoCurrentResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
}

export interface OpenMeteoUnits {
  time: string;
  temperature_2m?: string;
  relative_humidity_2m?: string;
  wind_speed_10m?: string;
  wind_direction_10m?: string;
  surface_pressure?: string;
  interval?: string;
}

export interface OpenMeteoCurrentData {
  time: string;
  interval: number;
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  surface_pressure: number;
}

export interface OpenMeteoForecastResponse extends OpenMeteoCurrentResponse {
  current_units?: OpenMeteoUnits;
  current?: OpenMeteoCurrentData;
  hourly_units?: OpenMeteoUnits;
  hourly?: HourlyWeatherData;
  daily_units?: OpenMeteoUnits;
  daily?: DailyWeatherData;
}

export interface OpenMeteoHistoricalResponse extends OpenMeteoCurrentResponse {
  hourly_units?: OpenMeteoUnits;
  hourly?: HourlyWeatherData;
}

// =============================================================================
// GEOCODING INTERFACES
// =============================================================================

export interface GeocodeComponent {
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

export interface GeocodeGeometry {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: GeocodeComponent;
  geometry: GeocodeGeometry;
  formatted?: string;
  confidence?: number;
}

export interface OpenCageComponent extends GeocodeComponent {
  ISO_3166_1_alpha_2?: string;
  ISO_3166_1_alpha_3?: string;
  _category?: string;
  _type?: string;
}

export interface OpenCageAnnotations {
  DMS: {
    lat: string;
    lng: string;
  };
  MGRS: string;
  Maidenhead: string;
  Mercator: {
    x: number;
    y: number;
  };
  OSM: {
    edit_url: string;
    note_url: string;
    url: string;
  };
  UN_M49: {
    regions: {
      [key: string]: string;
    };
    statistical_groupings: string[];
  };
  callingcode: number;
  currency: {
    alternate_symbols: string[];
    decimal_mark: string;
    html_entity: string;
    iso_code: string;
    iso_numeric: string;
    name: string;
    smallest_denomination: number;
    subunit: string;
    subunit_to_unit: number;
    symbol: string;
    symbol_first: number;
    thousands_separator: string;
  };
  flag: string;
  geohash: string;
  qibla: number;
  roadinfo: {
    drive_on: string;
    road: string;
    speed_in: string;
  };
  sun: {
    rise: {
      apparent: number;
      astronomical: number;
      civil: number;
      nautical: number;
    };
    set: {
      apparent: number;
      astronomical: number;
      civil: number;
      nautical: number;
    };
  };
  timezone: {
    name: string;
    now_in_dst: number;
    offset_sec: number;
    offset_string: string;
    short_name: string;
  };
  what3words: {
    words: string;
  };
}

export interface OpenCageGeometry {
  lat: number;
  lng: number;
}

export interface OpenCageResult {
  annotations: OpenCageAnnotations;
  bounds: {
    northeast: Coordinates;
    southwest: Coordinates;
  };
  components: OpenCageComponent;
  confidence: number;
  formatted: string;
  geometry: OpenCageGeometry;
}

export interface OpenCageResponse {
  documentation: string;
  licenses: Array<{
    name: string;
    url: string;
  }>;
  rate: {
    limit: number;
    remaining: number;
    reset: number;
  };
  results: OpenCageResult[];
  status: {
    code: number;
    message: string;
  };
  stay_informed: {
    blog: string;
    twitter: string;
  };
  thanks: string;
  timestamp: {
    created_http: string;
    created_unix: number;
  };
  total_results: number;
}

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

export interface HourlyDataDisplay {
  time: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
}

export interface LocationResult {
  latitude: number;
  longitude: number;
  address: string;
  confidence?: number;
  postcode?: string;
}

export interface WeatherDisplayData {
  location: LocationInfo;
  current: CurrentWeatherData;
  hourly?: HourlyWeatherData;
  daily?: DailyWeatherData;
}

// =============================================================================
// CHART INTERFACES
// =============================================================================

export interface MetricSelection {
  temperature: boolean;
  humidity: boolean;
  windSpeed: boolean;
  pressure: boolean;
}

export type GranularityType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ChartSeries {
  [key: string]: any; // Allow any additional properties
  name?: string;
  data?: (number | null)[];
  type?: string;
  smooth?: boolean;
  symbol?: string;
  symbolSize?: number;
  yAxisIndex?: number;
  lineStyle?: {
    color?: string;
    width?: number;
    type?: string;
    [key: string]: any;
  };
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    [key: string]: any;
  };
  tooltip?: {
    show?: boolean;
    [key: string]: any;
  };
  silent?: boolean;
}

export interface ChartYAxis {
  [key: string]: any; // Allow any additional properties
  type?: string;
  position?: 'left' | 'right';
  offset?: number;
  name?: string;
  nameLocation?: string;
  nameTextStyle?: {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    [key: string]: any;
  };
  axisLabel?: {
    color?: string;
    fontSize?: number;
    margin?: number;
    show?: boolean;
    [key: string]: any;
  };
  axisLine?: {
    show?: boolean;
    lineStyle?: {
      color?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  axisTick?: {
    show?: boolean;
    lineStyle?: {
      color?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  splitLine?: {
    show?: boolean;
    lineStyle?: {
      color?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export interface ChartOptions {
  [key: string]: any; // Allow any additional properties for echarts compatibility
  backgroundColor?: string;
  title?: {
    text?: string;
    left?: string;
    textStyle?: {
      color?: string;
      fontSize?: number;
      fontWeight?: number;
    };
  };
  tooltip?: {
    trigger?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    textStyle?: {
      color?: string;
      [key: string]: any;
    };
    axisPointer?: any;
    [key: string]: any;
  };
  legend?: {
    data?: string[];
    bottom?: number;
    top?: string;
    textStyle?: {
      color?: string;
      fontSize?: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
  grid?: {
    left?: string | number;
    right?: string | number;
    bottom?: string | number;
    top?: string | number;
    containLabel?: boolean;
    [key: string]: any;
  };
  xAxis?: {
    type?: string;
    data?: string[];
    axisLabel?: {
      color?: string;
      rotate?: number;
      fontSize?: number;
      fontFamily?: string;
      margin?: number;
      overflow?: string;
      [key: string]: any;
    };
    axisLine?: {
      lineStyle?: { color?: string; [key: string]: any };
      [key: string]: any;
    };
    axisTick?: {
      lineStyle?: { color?: string; [key: string]: any };
      [key: string]: any;
    };
    [key: string]: any;
  };
  yAxis?: ChartYAxis[];
  series?: ChartSeries[];
  animation?: boolean;
  animationDuration?: number;
  dataZoom?: any[];
}

// =============================================================================
// FORM INTERFACES
// =============================================================================

export type FieldName = 'roadType' | 'roadName' | 'roadNumber' | 'city' | 'county' | 'postalCode';

export interface FormFieldConfig {
  name: FieldName;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
}

export interface AddressFormData {
  roadType: string;
  roadName: string;
  roadNumber: string;
  city: string;
  county: string;
  postalCode: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: { [key in FieldName]?: string };
}

// =============================================================================
// ERROR INTERFACES
// =============================================================================

export interface ApiError {
  code: number;
  message: string;
  details?: any;
}

export interface WeatherServiceError extends ApiError {
  service: 'openmeteo' | 'geocoding' | 'historical';
  endpoint?: string;
  timestamp: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type WeatherMetric = 'temperature' | 'humidity' | 'windSpeed' | 'pressure';
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type WindSpeedUnit = 'kmh' | 'mph' | 'ms';
export type PressureUnit = 'hpa' | 'mb' | 'inhg';

export interface UnitPreferences {
  temperature: TemperatureUnit;
  windSpeed: WindSpeedUnit;
  pressure: PressureUnit;
}

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

export interface WeatherServiceConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface GeocodingServiceConfig extends WeatherServiceConfig {
  apiKey?: string;
  provider: 'opencage' | 'nominatim';
}

// =============================================================================
// EXPORTED LEGACY COMPATIBILITY
// =============================================================================

// For backward compatibility with existing WeatherData interface
export interface WeatherData extends WeatherDisplayData {}

// Re-export commonly used interfaces for convenience
export type {
  WeatherDisplayData as WeatherInfo,
  HourlyDataDisplay as HourlyForecast,
  LocationResult as GeoLocation,
  MetricSelection as ChartMetrics,
};

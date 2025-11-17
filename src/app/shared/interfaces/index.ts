// Barrel export file for shared interfaces
// This allows importing multiple interfaces from a single location:
// import { WeatherDisplayData, LocationResult } from './shared/interfaces';

export * from './weather.interfaces';

// Re-export commonly used interfaces with shorter names for convenience
export type { 
  WeatherDisplayData as WeatherData,
  HourlyDataDisplay as HourlyData,
  LocationResult as Location,
  MetricSelection as Metrics,
  GranularityType as Granularity
} from './weather.interfaces';
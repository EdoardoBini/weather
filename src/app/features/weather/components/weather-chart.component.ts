// ...existing code up to the first class definition...
// Remove everything above the @Component decorator except the correct import block
// ...existing code...
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  OnInit,
} from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WeatherDisplayData,
  MetricSelection,
  GranularityType,
  ChartOptions,
} from '../../../shared/interfaces';

import { WeatherService } from '../../../features/weather/services/weather.service';
import { inject } from '@angular/core';
@Component({
  selector: 'app-weather-chart',
  standalone: true,
  imports: [NgxEchartsModule, CommonModule, FormsModule],
  templateUrl: './weather-chart.component.html',
  styleUrls: ['./weather-chart.component.scss'],
})
export class WeatherChartComponent implements OnInit, OnChanges {
  // Error state for chart data loading
  chartError: string | null = null;

  // Retry handler for loading data
  retryLoadData() {
    this.chartError = null;
    if (this.dataMode === 'yearly') {
      this.loadYearlyData.emit();
    } else {
      this.handleDateRangeChange();
    }
  }
  /**
   * Downloads the chart data as JSON using the service method, based on current UI selections.
   */
  downloadChartData(): void {
    // Determine which data to use
    const isHistorical = this.dataMode === 'yearly';
    const data = isHistorical ? this.yearlyWeatherData : this.weatherData;
    if (!data) return;

    // Determine date range
    let startDate = '';
    let endDate = '';
    if (isHistorical) {
      startDate = this.customYearlyStart || this.minYearlyDate || '';
      endDate = this.customYearlyEnd || this.maxYearlyDate || '';
    } else {
      startDate = this.customStart;
      endDate = this.customEnd;
    }
    if (!startDate || !endDate) return;

    // Determine selected metrics (convert UI keys to data keys)
    const metricMap: { [k: string]: string } = {
      temperature: 'temperature_2m',
      humidity: 'relative_humidity_2m',
      windSpeed: 'wind_speed_10m',
      pressure: 'surface_pressure',
    };
    const metrics = Object.entries(this.selectedMetrics)
      .filter(([k, v]) => v)
      .map(([k]) => metricMap[k]);
    if (metrics.length === 0) return;

    // Use current granularity, fallback to 'hourly' if not allowed
    const allowedGranularities: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = [
      'hourly',
      'daily',
      'weekly',
      'monthly',
    ];
    const granularity: 'hourly' | 'daily' | 'weekly' | 'monthly' = allowedGranularities.includes(
      this.granularity as any
    )
      ? (this.granularity as any)
      : 'hourly';

    // Call the service method
    this.weatherService.downloadWeatherDataAsJson(
      data,
      startDate,
      endDate,
      granularity,
      metrics,
      isHistorical
    );
  }
  private hourlyDataCache: { [date: string]: any } = {};
  // Inject WeatherService using Angular's inject function
  private weatherService = inject(WeatherService);

  // Yearly mode date range state
  customYearlyStart: string | undefined;
  customYearlyEnd: string | undefined;
  minYearlyDate: string | undefined;
  maxYearlyDate: string | undefined;

  ngOnInit() {
    this.setYearlyDateRangeBounds();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['yearlyWeatherData'] &&
      this.yearlyWeatherData &&
      this.yearlyWeatherData.hourly &&
      this.yearlyWeatherData.hourly.time?.length
    ) {
      this.setYearlyDateRangeBounds();
    }
    if (changes['weatherData'] || changes['yearlyWeatherData'] || changes['isLoadingYearly']) {
      this.updateChart();
    }
  }

  setYearlyDateRangeBounds(forceReset: boolean = false) {
    if (
      this.yearlyWeatherData &&
      this.yearlyWeatherData.hourly &&
      this.yearlyWeatherData.hourly.time?.length
    ) {
      const times = this.yearlyWeatherData.hourly.time;
      this.minYearlyDate = times[0].slice(0, 10);
      this.maxYearlyDate = times[times.length - 1].slice(0, 10);
      if (forceReset || !this.customYearlyStart) this.customYearlyStart = this.minYearlyDate;
      if (forceReset || !this.customYearlyEnd) this.customYearlyEnd = this.maxYearlyDate;
    }
  }

  onYearlyStartDateChange() {
    if (
      this.customYearlyEnd &&
      this.customYearlyStart &&
      new Date(this.customYearlyStart) > new Date(this.customYearlyEnd)
    ) {
      this.customYearlyEnd = this.customYearlyStart;
    }
    this.updateChart();
  }

  onYearlyEndDateChange() {
    if (
      this.customYearlyStart &&
      this.customYearlyEnd &&
      new Date(this.customYearlyEnd) < new Date(this.customYearlyStart)
    ) {
      this.customYearlyStart = this.customYearlyEnd;
    }
    this.updateChart();
  }
  /**
   * Handles changes to the custom start date and updates the chart.
   */
  today: string = new Date().toISOString().slice(0, 10);
  maxCustomEnd: string = (() => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14); // 15 days including today
    return maxDate.toISOString().slice(0, 10);
  })();
  // Prefill start with today, end with 7 days after
  customStart: string = new Date().toISOString().slice(0, 10);
  customEnd: string = (() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    return endDate.toISOString().slice(0, 10);
  })();
  defaultGranularity: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'hourly';
  granularityOrder: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = [
    'hourly',
    'daily',
    'weekly',
    'monthly',
  ];
  @Input() weatherData: WeatherDisplayData | null = null;
  @Input() yearlyWeatherData: WeatherDisplayData | null = null;
  @Input() isLoadingYearly: boolean = false;
  @Output() loadYearlyData = new EventEmitter<void>();
  selectedMetrics: MetricSelection = {
    temperature: true,
    humidity: false,
    windSpeed: false,
    pressure: false,
  };
  metricLimit: number = 2;
  metricWarning: string = '';
  granularity: GranularityType = 'hourly';
  chartOptions: any = {};
  dataMode: 'current' | 'yearly' = 'current';
  get selectedCount(): number {
    return Object.values(this.selectedMetrics).filter(Boolean).length;
  }
  onStartDateChange() {
    if (
      this.customEnd &&
      this.customStart &&
      new Date(this.customStart) > new Date(this.customEnd)
    ) {
      this.customEnd = this.customStart;
    }
    this.handleDateRangeChange();
  }
  onEndDateChange() {
    if (
      this.customStart &&
      this.customEnd &&
      new Date(this.customEnd) < new Date(this.customStart)
    ) {
      this.customStart = this.customEnd;
    }
    this.handleDateRangeChange();
  }

  /**
   * Handles fetching forecast data for a new date range in 'current' mode.
   */
  private handleDateRangeChange() {
    // Only fetch for 'current' mode, not 'yearly'
    if (this.dataMode === 'current' && this.weatherData && this.weatherData.location) {
      const today = new Date(this.today);
      const start = new Date(this.customStart);
      const end = new Date(this.customEnd);
      // If start date is before today, show error and do not fetch
      if (start < today) {
        this.chartError = 'Forecast data is only available from today onwards.';
        this.updateChart();
        return;
      }
      // Calculate days from today to end date (inclusive)
      const diffTime = end.getTime() - today.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays >= 1) {
        this.weatherService
          .getForecastWeather(
            this.weatherData.location.lat,
            this.weatherData.location.lon,
            diffDays
          )
          .subscribe({
            next: (data: WeatherDisplayData) => {
              this.chartError = null;
              // Update all weatherData, not just hourly, to ensure consistency
              this.weatherData = {
                ...this.weatherData!,
                ...data,
              };
              this.updateChart();
            },
            error: (err) => {
              this.chartError = err?.message || 'Failed to load chart data.';
              this.updateChart();
            },
          });
        return;
      }
    }
    this.updateChart();
  }
  zoomIn() {
    const idx = this.granularityOrder.indexOf(this.granularity as any);
    if (idx > 0) {
      this.granularity = this.granularityOrder[idx - 1];
      this.updateChart();
    }
  }
  zoomOut() {
    const idx = this.granularityOrder.indexOf(this.granularity as any);
    if (idx < this.granularityOrder.length - 1) {
      this.granularity = this.granularityOrder[idx + 1];
      this.updateChart();
    }
  }
  resetZoom() {
    this.granularity = this.defaultGranularity;
    this.customStart = this.today;
    this.customEnd = (() => {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      return endDate.toISOString().slice(0, 10);
    })();
    this.updateChart();
  }

  // ...existing code...

  /**
   * Handles metric selection changes, enforces metric limit, and updates the chart.
   */
  onMetricChange(metric: keyof MetricSelection) {
    const selected = Object.values(this.selectedMetrics).filter(Boolean).length;
    if (selected > this.metricLimit) {
      this.selectedMetrics[metric] = false;
      this.metricWarning = `You can select at most ${this.metricLimit} metrics.`;
    } else {
      this.metricWarning = '';
      this.updateChart();
    }
  }

  /**
   * Handles switching between current and yearly data modes, loads data if needed, and updates chart.
   */
  onDataModeChange() {
    // Always clear cache when switching modes
    this.hourlyDataCache = {};
    this.chartError = null;

    if (this.dataMode === 'yearly') {
      this.granularity = 'monthly';
      // Force reset yearly date range to full available range
      this.setYearlyDateRangeBounds(true);
      // Always reload yearly data
      this.loadYearlyData.emit();
      this.updateChart();
      return;
    }

    if (this.dataMode === 'current') {
      this.granularity = this.defaultGranularity;
      // Reset current date range to default (today to today+7)
      this.customStart = this.today;
      this.customEnd = (() => {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        return endDate.toISOString().slice(0, 10);
      })();
      this.handleDateRangeChange();
      return;
    }
    this.updateChart();
  }

  /**
   * Updates the chart options and data based on selected metrics, granularity, and data mode.
   */
  updateChart() {
    // Get the appropriate data source based on the selected mode
    const currentData = this.dataMode === 'yearly' ? this.yearlyWeatherData : this.weatherData;

    if (!currentData || !currentData.hourly) {
      this.chartOptions = {};
      return;
    }

    const times = currentData.hourly.time;
    let xData: string[] = [];

    // Always strictly filter by selected date range, regardless of backend window
    let filteredIndexes: number[] = [];
    let filteredTimes: string[] = [];
    if (this.dataMode === 'current' && this.customStart && this.customEnd) {
      const startDate = new Date(this.customStart);
      const endDate = new Date(this.customEnd);
      filteredIndexes = times
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => {
          const d = new Date(t);
          return d >= startDate && d <= endDate;
        })
        .map(({ i }) => i);
      filteredTimes = filteredIndexes.map((i) => times[i]);
    } else if (this.dataMode === 'yearly' && this.customYearlyStart && this.customYearlyEnd) {
      const startDate = new Date(this.customYearlyStart);
      const endDate = new Date(this.customYearlyEnd);
      filteredIndexes = times
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => {
          const d = new Date(t);
          return d >= startDate && d <= endDate;
        })
        .map(({ i }) => i);
      filteredTimes = filteredIndexes.map((i) => times[i]);
    } else {
      filteredIndexes = times.map((_, i) => i);
      filteredTimes = times;
    }
    // Generate x-axis labels based on granularity for filtered data
    switch (this.granularity) {
      case 'hourly':
        if (this.dataMode === 'yearly') {
          xData = filteredTimes.map((time: string, index: number) => {
            if (index % 24 === 0) {
              const date = new Date(time);
              return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
            }
            return '';
          });
        } else {
          xData = filteredTimes.map((time: string) => {
            const date = new Date(time);
            return date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
            });
          });
        }
        break;
      case 'daily':
        xData = this.getDailyLabels(filteredTimes);
        break;
      case 'weekly':
        xData = this.getWeeklyLabels(filteredTimes);
        break;
      case 'monthly':
        xData = this.getMonthlyLabels(filteredTimes);
        break;
    }

    // Helper to filter metric arrays by filteredIndexes
    const filterMetric = (arr: number[] | undefined) =>
      arr ? filteredIndexes.map((i) => arr[i]) : [];

    // Generate series for each selected metric
    const series: any[] = [];
    const yAxes: any[] = [];
    let yAxisIndex = 0;

    let leftAxisCount = 0;
    let rightAxisCount = 0;

    if (this.selectedMetrics.temperature) {
      const data = filterMetric(currentData.hourly.temperature_2m);
      series.push(this.createSeries('Temperature (°C)', data, '#1976d2', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Temperature (°C)', '#1976d2', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.humidity) {
      const data = filterMetric(currentData.hourly.relative_humidity_2m);
      series.push(this.createSeries('Humidity (%)', data, '#2196f3', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Humidity (%)', '#2196f3', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.windSpeed) {
      const data = filterMetric(currentData.hourly.wind_speed_10m);
      series.push(this.createSeries('Wind Speed (km/h)', data, '#4caf50', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Wind Speed (km/h)', '#4caf50', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.pressure) {
      const data = filterMetric(currentData.hourly.surface_pressure);
      series.push(this.createSeries('Pressure (hPa)', data, '#ff9800', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Pressure (hPa)', '#ff9800', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    // If no metrics are selected, show a placeholder series and axis
    if (series.length === 0) {
      series.push({
        name: 'No metrics selected',
        type: 'line',
        data: new Array(xData.length).fill(null),
        lineStyle: { color: '#ccc', width: 2, type: 'dashed' },
        itemStyle: { color: '#ccc' },
        symbol: 'none',
        tooltip: { show: false },
        silent: true,
      });
      yAxes.push({
        type: 'value',
        name: '',
        position: 'left',
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      });
    }

    this.chartOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#1976d2',
        borderWidth: 1,
        textStyle: { color: '#333' },
        axisPointer: {
          lineStyle: { color: '#1976d2' },
        },
      },
      legend: {
        top: '5%',
        textStyle: { fontSize: 12 },
      },
      grid: {
        left: Math.max(80, leftAxisCount * 60 + 40),
        right: Math.max(40, rightAxisCount * 60 + 20),
        bottom: '20%',
        top: '20%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: {
          rotate: 45,
          color: '#666',
          fontSize: 10,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 8,
          overflow: 'truncate',
        },
        axisLine: { lineStyle: { color: '#e0e0e0' } },
        axisTick: { lineStyle: { color: '#e0e0e0' } },
      },
      yAxis: yAxes,
      series: series,
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          minSpan: 1,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'filter',
          height: 24,
          bottom: 10,
          handleSize: 16,
          handleStyle: {
            color: '#1976d2',
            borderColor: '#1976d2',
          },
          backgroundColor: '#e3f2fd',
          borderColor: '#1976d2',
          fillerColor: 'rgba(25, 118, 210, 0.15)',
          labelFormatter: '',
        },
      ],
    };
  }

  /**
   * Generates daily x-axis labels from time data.
   */
  getDailyLabels(times: string[]): string[] {
    const days = Array.from(new Set(times.map((t) => t.slice(0, 10))));
    return days.map((day) => {
      const date = new Date(day);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    });
  }
  /**
   * Calculates daily averages for a metric from time and value arrays.
   */
  getDailyAverages(times: string[], values: number[]): number[] {
    const dayMap: { [day: string]: number[] } = {};
    times.forEach((t, i) => {
      const day = t.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(values[i]);
    });
    return Object.values(dayMap).map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  /**
   * Generates weekly x-axis labels from time data.
   */
  getWeeklyLabels(times: string[]): string[] {
    const weeks = Array.from(
      new Set(
        times.map((t) => {
          const d = new Date(t);
          const year = d.getFullYear();
          const week = this.getWeekNumber(d);
          return `${year}-W${week}`;
        })
      )
    );
    return weeks.map((week) => {
      const [year, weekNum] = week.split('-W');
      return `Week ${weekNum}, ${year}`;
    });
  }
  /**
   * Calculates weekly averages for a metric from time and value arrays.
   */
  getWeeklyAverages(times: string[], values: number[]): number[] {
    const weekMap: { [week: string]: number[] } = {};
    times.forEach((t, i) => {
      const d = new Date(t);
      const year = d.getFullYear();
      const week = this.getWeekNumber(d);
      const key = `${year}-W${week}`;
      if (!weekMap[key]) weekMap[key] = [];
      weekMap[key].push(values[i]);
    });
    return Object.values(weekMap).map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  /**
   * Generates monthly x-axis labels from time data.
   */
  getMonthlyLabels(times: string[]): string[] {
    const months = Array.from(new Set(times.map((t) => t.slice(0, 7))));
    return months.map((month) => {
      const date = new Date(month + '-01');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      });
    });
  }
  /**
   * Calculates monthly averages for a metric from time and value arrays.
   */
  getMonthlyAverages(times: string[], values: number[]): number[] {
    const monthMap: { [month: string]: number[] } = {};
    times.forEach((t, i) => {
      const month = t.slice(0, 7);
      if (!monthMap[month]) monthMap[month] = [];
      monthMap[month].push(values[i]);
    });
    return Object.values(monthMap).map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  /**
   * Filters time and value arrays to the selected custom date range and formats labels.
   */
  getCustomRange(times: string[], values: number[]): [string[], number[]] {
    if (!this.customStart || !this.customEnd) return [[], []];
    const start = new Date(this.customStart).getTime();
    const end = new Date(this.customEnd).getTime();
    const x: string[] = [];
    const y: number[] = [];
    times.forEach((t, i) => {
      const time = new Date(t).getTime();
      if (time >= start && time <= end) {
        const date = new Date(t);
        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
        });
        x.push(formattedDate);
        y.push(values[i]);
      }
    });
    return [x, y];
  }
  /**
   * Returns the ISO week number for a given date.
   */
  getWeekNumber(d: Date): number {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Processes and aggregates metric data based on the selected granularity and data mode.
   */
  getProcessedData(metric: string, times: string[]): number[] {
    // Get the appropriate data source based on the selected mode
    const currentData = this.dataMode === 'yearly' ? this.yearlyWeatherData : this.weatherData;

    if (!currentData || !currentData.hourly) return [];

    let rawData: number[] = [];
    switch (metric) {
      case 'temperature':
        rawData = currentData.hourly.temperature_2m || [];
        break;
      case 'humidity':
        rawData = currentData.hourly.relative_humidity_2m || [];
        break;
      case 'windSpeed':
        rawData = (currentData.hourly.wind_speed_10m || []).map((speed: number) => speed * 3.6);
        break;
      case 'pressure':
        rawData = currentData.hourly.surface_pressure || [];
        break;
    }

    // Process data based on granularity
    switch (this.granularity) {
      case 'hourly':
        return rawData;
      case 'daily':
        return this.getDailyAverages(times, rawData);
      case 'weekly':
        return this.getWeeklyAverages(times, rawData);
      case 'monthly':
        return this.getMonthlyAverages(times, rawData);
      case 'custom':
        const [, customData] = this.getCustomRange(times, rawData);
        return customData;
      default:
        return rawData;
    }
  }

  /**
   * Returns formatted x-axis labels for the selected custom date range.
   */
  getCustomRangeLabels(times: string[]): [string[]] {
    const [labels] = this.getCustomRange(times, []);
    return [labels];
  }

  /**
   * Creates a chart series configuration for a given metric.
   */
  createSeries(name: string, data: number[], color: string, yAxisIndex: number): any {
    return {
      name: name,
      data: data,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      yAxisIndex: yAxisIndex,
      lineStyle: {
        color: color,
        width: 2,
      },
      itemStyle: {
        color: color,
        borderColor: '#fff',
        borderWidth: 1,
      },
    };
  }

  /**
   * Creates a y-axis configuration for a given metric and position.
   */
  createYAxis(name: string, color: string, position: 'left' | 'right', offset?: number): any {
    return {
      type: 'value',
      name: name,
      position: position,
      offset: offset || 0,
      nameTextStyle: {
        color: color,
        fontSize: 11,
        fontWeight: 600,
      },
      axisLabel: {
        color: color,
        fontSize: 10,
        margin: 8,
      },
      axisLine: {
        show: true,
        lineStyle: { color: color },
      },
      axisTick: {
        show: true,
        lineStyle: { color: color },
      },
      splitLine: {
        show: position === 'left' && offset === 0,
        lineStyle: { color: '#f0f0f0' },
      },
    };
  }
}

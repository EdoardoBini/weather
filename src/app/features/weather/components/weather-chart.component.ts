import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WeatherDisplayData,
  MetricSelection,
  GranularityType,
  ChartOptions,
} from '../../../shared/interfaces';

@Component({
  selector: 'app-weather-chart',
  standalone: true,
  imports: [NgxEchartsModule, CommonModule, FormsModule],
  templateUrl: './weather-chart.component.html',
  styleUrls: ['./weather-chart.component.scss'],
})
export class WeatherChartComponent implements OnChanges {
  /**
   * Handles changes to the custom start date and updates the chart.
   */
  onStartDateChange() {
    if (
      this.customEnd &&
      this.customStart &&
      new Date(this.customStart) > new Date(this.customEnd)
    ) {
      this.customEnd = '';
    }
    this.updateChart();
  }

  /**
   * Handles changes to the custom end date and updates the chart.
   */
  onEndDateChange() {
    if (
      this.customStart &&
      this.customEnd &&
      new Date(this.customEnd) < new Date(this.customStart)
    ) {
      this.customStart = '';
    }
    this.updateChart();
  }
  today: string = new Date().toISOString().slice(0, 10);
  /**
   * Returns the number of selected metrics.
   */
  get selectedCount(): number {
    return Object.values(this.selectedMetrics).filter(Boolean).length;
  }
  defaultGranularity: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom' = 'hourly';
  granularityOrder: Array<'hourly' | 'daily' | 'weekly' | 'monthly'> = [
    'hourly',
    'daily',
    'weekly',
    'monthly',
  ];
  /**
   * Zooms in the chart by decreasing the granularity (e.g., from daily to hourly).
   */
  zoomIn() {
    const idx = this.granularityOrder.indexOf(this.granularity as any);
    if (idx > 0) {
      this.granularity = this.granularityOrder[idx - 1];
      this.updateChart();
    }
  }

  /**
   * Zooms out the chart by increasing the granularity (e.g., from hourly to daily).
   */
  zoomOut() {
    const idx = this.granularityOrder.indexOf(this.granularity as any);
    if (idx < this.granularityOrder.length - 1) {
      this.granularity = this.granularityOrder[idx + 1];
      this.updateChart();
    }
  }

  /**
   * Resets the chart zoom and custom date range to defaults.
   */
  resetZoom() {
    this.granularity = this.defaultGranularity;
    this.customStart = '';
    this.customEnd = '';
    this.updateChart();
  }
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
  customStart: string = '';
  customEnd: string = '';
  chartOptions: any = {};
  dataMode: 'current' | 'yearly' = 'current';

  /**
   * Reacts to input changes and updates the chart accordingly.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['weatherData'] || changes['yearlyWeatherData'] || changes['isLoadingYearly']) {
      this.updateChart();
    }
  }

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
    // Request yearly data if it's not loaded yet and user selected yearly mode
    if (this.dataMode === 'yearly' && !this.yearlyWeatherData) {
      this.loadYearlyData.emit();
    }

    // Set appropriate default granularity for yearly data
    if (this.dataMode === 'yearly') {
      this.granularity = 'monthly';
    } else {
      this.granularity = this.defaultGranularity;
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

    // Generate x-axis labels based on granularity
    switch (this.granularity) {
      case 'hourly':
        if (this.dataMode === 'yearly') {
          // For yearly data, show date and hour less frequently to avoid crowding
          xData = times.map((time: string, index: number) => {
            if (index % 24 === 0) {
              // Show every 24th hour (daily)
              const date = new Date(time);
              return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
            }
            return '';
          });
        } else {
          xData = times.map((time: string) => {
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
        xData = this.getDailyLabels(times);
        break;
      case 'weekly':
        xData = this.getWeeklyLabels(times);
        break;
      case 'monthly':
        xData = this.getMonthlyLabels(times);
        break;
      case 'custom':
        [xData] = this.getCustomRangeLabels(times);
        break;
    }

    // Generate series for each selected metric
    const series: any[] = [];
    const yAxes: any[] = [];
    let yAxisIndex = 0;

    let leftAxisCount = 0;
    let rightAxisCount = 0;

    if (this.selectedMetrics.temperature) {
      const data = this.getProcessedData('temperature', times);
      series.push(this.createSeries('Temperature (°C)', data, '#1976d2', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Temperature (°C)', '#1976d2', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.humidity) {
      const data = this.getProcessedData('humidity', times);
      series.push(this.createSeries('Humidity (%)', data, '#2196f3', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Humidity (%)', '#2196f3', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.windSpeed) {
      const data = this.getProcessedData('windSpeed', times);
      series.push(this.createSeries('Wind Speed (km/h)', data, '#4caf50', yAxisIndex));
      const position = yAxisIndex % 2 === 0 ? 'left' : 'right';
      const offset = position === 'left' ? leftAxisCount * 60 : rightAxisCount * 60;
      yAxes.push(this.createYAxis('Wind Speed (km/h)', '#4caf50', position, offset));
      if (position === 'left') leftAxisCount++;
      else rightAxisCount++;
      yAxisIndex++;
    }

    if (this.selectedMetrics.pressure) {
      const data = this.getProcessedData('pressure', times);
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
          minSpan: 5,
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

import type { HarnessMetricSnapshot } from "../contracts.js";

type CounterRecord = { kind: "counter"; value: number; tags?: Record<string, string> };
type GaugeRecord = { kind: "gauge"; value: number; tags?: Record<string, string> };
type HistogramRecord = { kind: "histogram"; values: number[]; tags?: Record<string, string> };
type MetricRecord = CounterRecord | GaugeRecord | HistogramRecord;

export class MetricsRecorder {
  private readonly metrics = new Map<string, MetricRecord>();

  increment(name: string, amount = 1, tags?: Record<string, string>): void {
    const current = this.metrics.get(name);
    if (!current || current.kind !== "counter") {
      this.metrics.set(name, { kind: "counter", value: amount, tags });
      return;
    }
    current.value += amount;
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.set(name, { kind: "gauge", value, tags });
  }

  observe(name: string, value: number, tags?: Record<string, string>): void {
    const current = this.metrics.get(name);
    if (!current || current.kind !== "histogram") {
      this.metrics.set(name, { kind: "histogram", values: [value], tags });
      return;
    }
    current.values.push(value);
  }

  snapshot(): HarnessMetricSnapshot[] {
    return [...this.metrics.entries()].map(([name, metric]) => {
      if (metric.kind === "counter" || metric.kind === "gauge") {
        return { name, kind: metric.kind, value: metric.value, tags: metric.tags };
      }
      const count = metric.values.length;
      const value = metric.values.reduce((sum, item) => sum + item, 0);
      const min = count ? Math.min(...metric.values) : 0;
      const max = count ? Math.max(...metric.values) : 0;
      const avg = count ? value / count : 0;
      return { name, kind: "histogram", value, count, min, max, avg, tags: metric.tags };
    });
  }
}

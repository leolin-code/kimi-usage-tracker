import type { SeriesBucket } from "../../types.ts";
import type { ChartPalette } from "../../hooks/use-echarts.ts";
import type { TokenFocusKey } from "../../state/dashboard.tsx";
import i18n, { currentLocale } from "../../i18n.ts";

export type TrendMetricKey =
  | "total"
  | "input"
  | "cacheRead"
  | "cacheCreation"
  | "output"
  | "requests"
  | "cost";

export type TrendMetricDef = Readonly<{
  key: TrendMetricKey;
  label: string;
  axis: "left" | "right";
  color: (palette: ChartPalette) => string;
  value: (bucket: SeriesBucket) => number;
  format: (value: number) => string;
  focusKey: TokenFocusKey | null;
}>;

const compact = (value: number) =>
  new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1, notation: "compact" }).format(
    value,
  );
const full = (value: number) =>
  new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 0 }).format(value);

const cny = (digits: number) =>
  new Intl.NumberFormat(currentLocale(), {
    currency: "CNY",
    style: "currency",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const cnyCompact = cny(2);
const cnyFull = cny(4);

export const TREND_METRICS: readonly TrendMetricDef[] = [
  {
    key: "total",
    label: "metrics.total",
    axis: "left",
    color: (p) => p.colors[0],
    value: (b) => b.tokens.total,
    format: compact,
    focusKey: null,
  },
  {
    key: "input",
    label: "metrics.input",
    axis: "left",
    color: (p) => p.blue,
    value: (b) => b.tokens.inputOther,
    format: compact,
    focusKey: "input",
  },
  {
    key: "cacheRead",
    label: "metrics.cacheRead",
    axis: "left",
    color: (p) => p.green,
    value: (b) => b.tokens.inputCacheRead,
    format: compact,
    focusKey: "cache",
  },
  {
    key: "cacheCreation",
    label: "metrics.cacheCreation",
    axis: "left",
    color: (p) => p.colors[4],
    value: (b) => b.tokens.inputCacheCreation,
    format: compact,
    focusKey: "cache-write",
  },
  {
    key: "output",
    label: "metrics.output",
    axis: "left",
    color: (p) => p.orange,
    value: (b) => b.tokens.output,
    format: compact,
    focusKey: "output",
  },
  {
    key: "requests",
    label: "metrics.requests",
    axis: "right",
    color: (p) => p.mutedForeground,
    value: (b) => b.requests,
    format: compact,
    focusKey: null,
  },
  {
    key: "cost",
    label: "metrics.costShort",
    axis: "right",
    color: (p) => p.teal,
    value: (b) => Number.parseFloat(b.costCny) || 0,
    format: (v) => cnyCompact.format(v),
    focusKey: null,
  },
];

export function exactValue(metric: TrendMetricKey, bucket: SeriesBucket): string {
  switch (metric) {
    case "cost":
      return cnyFull.format(Number.parseFloat(bucket.costCny) || 0);
    case "requests":
      return i18n.t("metrics.requestCount", { count: full(bucket.requests) });
    case "total":
      return `${full(bucket.tokens.total)} Token`;
    case "input":
      return `${full(bucket.tokens.inputOther)} Token`;
    case "cacheRead":
      return `${full(bucket.tokens.inputCacheRead)} Token`;
    case "cacheCreation":
      return `${full(bucket.tokens.inputCacheCreation)} Token`;
    case "output":
      return `${full(bucket.tokens.output)} Token`;
  }
}

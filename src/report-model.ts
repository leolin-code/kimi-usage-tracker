import type { TokenTotals } from "./types.ts";
import i18n, { currentLocale } from "./i18n.ts";

export function formatTokens(value: number, compact = true): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(safe);
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
  return `${(safe * 100).toFixed(safe >= 0.1 ? 1 : 2)}%`;
}

export function formatDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "—";
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;

  const totalSeconds = Math.round(value / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function formatCny(value: string | null, fractionDigits = 4): string {
  if (value === null) return i18n.t("common.unpriced");
  const amount = Number.parseFloat(value);
  const precision = Math.max(0, Math.min(fractionDigits, 6));
  if (!Number.isFinite(amount)) return `¥${(0).toFixed(precision)}`;
  return new Intl.NumberFormat(currentLocale(), {
    currency: "CNY",
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    style: "currency",
  }).format(amount);
}

export function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(value);
}

export function tokenSegments(tokens: TokenTotals) {
  const total = Math.max(tokens.total, 1);
  return [
    {
      key: "input",
      label: i18n.t("metrics.input"),
      value: tokens.inputOther,
      ratio: tokens.inputOther / total,
    },
    {
      key: "cache",
      label: i18n.t("metrics.cacheRead"),
      value: tokens.inputCacheRead,
      ratio: tokens.inputCacheRead / total,
    },
    {
      key: "cache-write",
      label: i18n.t("metrics.cacheCreation"),
      value: tokens.inputCacheCreation,
      ratio: tokens.inputCacheCreation / total,
    },
    {
      key: "output",
      label: i18n.t("metrics.output"),
      value: tokens.output,
      ratio: tokens.output / total,
    },
  ] as const;
}

export function shortModelName(model: string): string {
  const segment = model.split("/").at(-1)?.trim();
  return segment || "unknown";
}

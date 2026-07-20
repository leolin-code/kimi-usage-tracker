import type { TokenTotals } from "./types.ts";

const compactNumber = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const fullNumber = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

export function formatTokens(value: number, compact = true): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return compact ? compactNumber.format(safe) : fullNumber.format(safe);
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
  return `${(safe * 100).toFixed(safe >= 0.1 ? 1 : 2)}%`;
}

export function formatCny(value: string | null, fractionDigits = 4): string {
  if (value === null) return "未定价";
  const amount = Number.parseFloat(value);
  const precision = Math.max(0, Math.min(fractionDigits, 6));
  if (!Number.isFinite(amount)) return `¥${(0).toFixed(precision)}`;
  return new Intl.NumberFormat("zh-CN", {
    currency: "CNY",
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    style: "currency",
  }).format(amount);
}

export function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(value);
}

export function tokenSegments(tokens: TokenTotals) {
  const total = Math.max(tokens.total, 1);
  return [
    { key: "input", label: "普通输入", value: tokens.inputOther, ratio: tokens.inputOther / total },
    {
      key: "cache",
      label: "缓存读取",
      value: tokens.inputCacheRead,
      ratio: tokens.inputCacheRead / total,
    },
    {
      key: "cache-write",
      label: "缓存创建",
      value: tokens.inputCacheCreation,
      ratio: tokens.inputCacheCreation / total,
    },
    { key: "output", label: "输出", value: tokens.output, ratio: tokens.output / total },
  ] as const;
}

export function shortModelName(model: string): string {
  const segment = model.split("/").at(-1)?.trim();
  return segment || "unknown";
}

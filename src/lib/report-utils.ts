import type { BillingFilter, FilterDimensions, Granularity, ScanFilter } from "../types.ts";
import i18n from "../i18n.ts";

export type { BillingFilter, Granularity } from "../types.ts";

/* ---------------------------------------------------------------------------
 * 快捷时间范围
 * ------------------------------------------------------------------------- */

export type QuickRangeKey =
  | "today"
  | "yesterday"
  | "last24h"
  | "last7d"
  | "last30d"
  | "thisMonth"
  | "lastMonth"
  | "all"
  | "custom";

export function quickRangeLabel(key: QuickRangeKey): string {
  return i18n.t(`range.${key}`);
}

export const QUICK_RANGE_ORDER: readonly QuickRangeKey[] = [
  "today",
  "yesterday",
  "last24h",
  "last7d",
  "last30d",
  "thisMonth",
  "lastMonth",
  "all",
];

export type ResolvedRange = Readonly<{
  startMs: number | null;
  endMs: number | null;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 计算快捷范围的闭区间毫秒值（本地时区）；自定义范围直接透传。 */
export function resolveQuickRange(
  key: QuickRangeKey,
  now: Date = new Date(),
  custom?: ResolvedRange,
): ResolvedRange {
  const nowMs = now.getTime();
  switch (key) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startMs: start.getTime(), endMs: nowMs };
    }
    case "yesterday": {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(end.getTime() - DAY_MS);
      return { startMs: start.getTime(), endMs: end.getTime() - 1 };
    }
    case "last24h":
      return { startMs: nowMs - DAY_MS, endMs: nowMs };
    case "last7d":
      return { startMs: nowMs - 7 * DAY_MS, endMs: nowMs };
    case "last30d":
      return { startMs: nowMs - 30 * DAY_MS, endMs: nowMs };
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startMs: start.getTime(), endMs: nowMs };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startMs: start.getTime(), endMs: end.getTime() - 1 };
    }
    case "all":
      return { startMs: null, endMs: null };
    case "custom":
      return {
        startMs: custom?.startMs ?? null,
        endMs: custom?.endMs ?? null,
      };
  }
}

/* ---------------------------------------------------------------------------
 * 环比 delta
 * ------------------------------------------------------------------------- */

export type DeltaDirection = "up" | "down" | "flat";

export type Delta = Readonly<{
  /** 相对上一周期的变化率；上一周期为 0 或缺失时为 null */
  ratio: number | null;
  direction: DeltaDirection;
}>;

export function computeDelta(current: number, previous: number | null | undefined): Delta {
  if (previous === null || previous === undefined) {
    return { ratio: null, direction: "flat" };
  }
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    // 上一周期为 0：当前也为 0 视为持平，否则无法给出百分比
    return { ratio: null, direction: current > 0 ? "up" : "flat" };
  }
  const ratio = (current - previous) / previous;
  if (Math.abs(ratio) < 1e-9) return { ratio: 0, direction: "flat" };
  return { ratio, direction: ratio > 0 ? "up" : "down" };
}

export function formatDeltaRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  const percent = ratio * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(Math.abs(percent) >= 100 ? 0 : 1)}%`;
}

/* ---------------------------------------------------------------------------
 * CSV 构建
 * ------------------------------------------------------------------------- */

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** 构建带 BOM 的 CSV 文本（Excel 兼容中文）。 */
export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => csvEscape(cell)).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

/* ---------------------------------------------------------------------------
 * 轴标签与粒度
 * ------------------------------------------------------------------------- */

const pad2 = (value: number) => String(value).padStart(2, "0");

/** 按桶粒度格式化 X 轴标签（本地时区）。 */
export function formatAxisLabel(startMs: number, granularity: string): string {
  const date = new Date(startMs);
  switch (granularity) {
    case "minute":
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    case "hour":
      return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:00`;
    case "week":
    case "day":
      return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    case "month":
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    default:
      return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
}

export function granularityLabel(granularity: string): string {
  if (["minute", "hour", "day", "week", "month"].includes(granularity)) {
    return i18n.t(`granularity.${granularity}`);
  }
  return granularity || "—";
}

/* ---------------------------------------------------------------------------
 * 时区展示
 * ------------------------------------------------------------------------- */

/** 返回 "Asia/Shanghai (GMT+8)" 风格的时区描述。 */
export function timezoneLabel(now: Date = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone";
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const offset = minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${pad2(minutes)}`;
  return `${zone} (${offset})`;
}

/* ---------------------------------------------------------------------------
 * 筛选状态 → ScanFilter 组装
 * ------------------------------------------------------------------------- */

export type MultiMode = "include" | "exclude";

export type MultiFilter = Readonly<{
  selected: readonly string[];
  mode: MultiMode;
}>;

export const EMPTY_MULTI: MultiFilter = { selected: [], mode: "include" };

export type FilterState = Readonly<{
  quickRange: QuickRangeKey;
  customStartMs: number | null;
  customEndMs: number | null;
  models: MultiFilter;
  sessions: MultiFilter;
  agents: MultiFilter;
  scopes: MultiFilter;
  billing: BillingFilter;
  granularity: Granularity;
}>;

export const DEFAULT_FILTER_STATE: FilterState = {
  quickRange: "last30d",
  customStartMs: null,
  customEndMs: null,
  models: EMPTY_MULTI,
  sessions: EMPTY_MULTI,
  agents: EMPTY_MULTI,
  scopes: EMPTY_MULTI,
  billing: "all",
  granularity: "auto",
};

/**
 * 把单个多选条件折叠成后端参数：
 * - include 空选 = 不筛选
 * - exclude = dimensions 全集减去选中项；空选同样不筛选
 */
export function resolveMultiParam(
  filter: MultiFilter,
  allValues: readonly string[],
): string[] | undefined {
  if (filter.selected.length === 0) return undefined;
  if (filter.mode === "include") return [...filter.selected];
  const excluded = new Set(filter.selected);
  const remaining = allValues.filter((value) => !excluded.has(value));
  return remaining.length === allValues.length ? undefined : remaining;
}

/** 由筛选状态 + dimensions 组装后端 ScanFilter。 */
export function buildScanFilter(
  state: FilterState,
  dimensions: FilterDimensions | null,
  now: Date = new Date(),
): ScanFilter {
  const range = resolveQuickRange(state.quickRange, now, {
    startMs: state.customStartMs,
    endMs: state.customEndMs,
  });
  const dimValues = (list: readonly { value: string }[] | undefined) =>
    (list ?? []).map((item) => item.value);
  return {
    startMs: range.startMs,
    endMs: range.endMs,
    models: resolveMultiParam(state.models, dimValues(dimensions?.models)),
    sessions: resolveMultiParam(state.sessions, dimValues(dimensions?.sessions)),
    agents: resolveMultiParam(state.agents, dimValues(dimensions?.agents)),
    scopes: resolveMultiParam(state.scopes, dimValues(dimensions?.scopes)),
    billing: state.billing,
    granularity: state.granularity,
  };
}

/** 统计当前生效的筛选条件数量（时间范围按 1 计，默认近30天除外）。 */
export function activeFilterCount(state: FilterState): number {
  let count = 0;
  if (state.quickRange !== DEFAULT_FILTER_STATE.quickRange) count += 1;
  if (state.models.selected.length > 0) count += 1;
  if (state.sessions.selected.length > 0) count += 1;
  if (state.agents.selected.length > 0) count += 1;
  if (state.scopes.selected.length > 0) count += 1;
  if (state.billing !== "all") count += 1;
  return count;
}

export function isDefaultFilter(state: FilterState): boolean {
  return activeFilterCount(state) === 0 && state.granularity === "auto";
}

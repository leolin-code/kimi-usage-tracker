import type {
  BillingFilter,
  DimensionValue,
  Granularity,
  ModelUsage,
  RecentUsage,
  ScanFilter,
  SeriesBucket,
  TokenTotals,
  UsageReport,
} from "./types.ts";

/* ---------------------------------------------------------------------------
 * 纯浏览器 dev 环境下的确定性合成 UsageReport
 * 仅实现基本过滤（时间范围 / 模型 / 会话 / Agent / 请求类型 / 计费状态 / 粒度），
 * 让 `npm run dev` 可以预览全部 UI 状态。
 * ------------------------------------------------------------------------- */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BASE_HOURS = 400 * 24; // 400 天的小时级基线数据

type MockModel = Readonly<{
  model: string;
  aliases: readonly string[];
  pricing: ModelUsage["pricing"];
}>;

const MODELS: readonly MockModel[] = [
  {
    model: "kimi-k2-0905-preview",
    aliases: ["kimi-k2", "k2"],
    pricing: {
      model: "kimi-k2-0905-preview",
      inputCnyPerMillion: "4",
      outputCnyPerMillion: "16",
      cacheReadCnyPerMillion: "1",
      contextTokens: 262144,
      sourceUrl: "https://platform.moonshot.cn/docs/pricing/chat",
      verifiedOn: "2026-06-30",
    },
  },
  {
    model: "kimi-k2-0711-preview",
    aliases: ["k2-0711"],
    pricing: {
      model: "kimi-k2-0711-preview",
      inputCnyPerMillion: "4",
      outputCnyPerMillion: "16",
      cacheReadCnyPerMillion: "1",
      contextTokens: 131072,
      sourceUrl: "https://platform.moonshot.cn/docs/pricing/chat",
      verifiedOn: "2026-06-30",
    },
  },
  {
    model: "kimi-k2-turbo-preview",
    aliases: ["k2-turbo"],
    pricing: {
      model: "kimi-k2-turbo-preview",
      inputCnyPerMillion: "8",
      outputCnyPerMillion: "32",
      cacheReadCnyPerMillion: "2",
      contextTokens: 262144,
      sourceUrl: "https://platform.moonshot.cn/docs/pricing/chat",
      verifiedOn: "2026-06-30",
    },
  },
  { model: "kimi-for-coding", aliases: ["订阅模型"], pricing: null },
  { model: "kimi-k1.5", aliases: [], pricing: null },
  {
    model: "moonshot-v1-128k",
    aliases: ["v1-128k"],
    pricing: {
      model: "moonshot-v1-128k",
      inputCnyPerMillion: "60",
      outputCnyPerMillion: "60",
      cacheReadCnyPerMillion: "60",
      contextTokens: 131072,
      sourceUrl: "https://platform.moonshot.cn/docs/pricing/chat",
      verifiedOn: "2026-05-12",
    },
  },
];

const SESSIONS = Array.from({ length: 12 }, (_, index) => {
  const day = new Date(Date.now() - index * 3 * DAY_MS);
  const stamp = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(
    day.getDate(),
  ).padStart(2, "0")}`;
  return `session-${stamp}-${(index * 7919).toString(16)}`;
});

const AGENTS = ["main", "coder", "explore", "plan"] as const;
const SCOPES = ["project", "user"] as const;

/** mulberry32：确定性伪随机数生成器 */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BasePoint = Readonly<{
  startMs: number;
  modelIndex: number;
  session: string;
  agent: string;
  scope: string;
  requests: number;
  tokens: TokenTotals;
}>;

/** 生成一次、全局复用的小时级基线（以当前小时为终点）。 */
function buildBasePoints(nowHourMs: number): BasePoint[] {
  const points: BasePoint[] = [];
  for (let hour = BASE_HOURS - 1; hour >= 0; hour -= 1) {
    const startMs = nowHourMs - hour * HOUR_MS;
    // 周末与晚间用量更高，制造可读的波形
    const date = new Date(startMs);
    const dayFactor = date.getDay() === 0 || date.getDay() === 6 ? 0.45 : 1;
    const hourFactor = date.getHours() >= 9 && date.getHours() <= 22 ? 1 : 0.15;
    for (let modelIndex = 0; modelIndex < MODELS.length; modelIndex += 1) {
      const rand = mulberry32(hour * 131 + modelIndex * 17 + 7);
      const weight = [5, 3, 1.2, 4, 0.8, 0.5][modelIndex] ?? 1;
      const requests = Math.floor(rand() * 6 * weight * dayFactor * hourFactor);
      if (requests === 0) continue;
      const inputOther = Math.floor(requests * (800 + rand() * 4000));
      const inputCacheRead = Math.floor(requests * (2000 + rand() * 24000));
      const inputCacheCreation = Math.floor(requests * (300 + rand() * 5000));
      const output = Math.floor(requests * (200 + rand() * 1800));
      points.push({
        startMs,
        modelIndex,
        session: SESSIONS[(hour + modelIndex) % SESSIONS.length],
        agent: AGENTS[(hour + modelIndex * 2) % AGENTS.length],
        scope: SCOPES[(hour + modelIndex) % SCOPES.length],
        requests,
        tokens: {
          inputOther,
          output,
          inputCacheRead,
          inputCacheCreation,
          total: inputOther + output + inputCacheRead + inputCacheCreation,
        },
      });
    }
  }
  return points;
}

function emptyTokens(): TokenTotals {
  return {
    inputOther: 0,
    output: 0,
    inputCacheRead: 0,
    inputCacheCreation: 0,
    total: 0,
  };
}

function addTokens(target: TokenTotals, source: TokenTotals): void {
  (target as { -readonly [K in keyof TokenTotals]: number }).inputOther += source.inputOther;
  (target as { -readonly [K in keyof TokenTotals]: number }).output += source.output;
  (target as { -readonly [K in keyof TokenTotals]: number }).inputCacheRead +=
    source.inputCacheRead;
  (target as { -readonly [K in keyof TokenTotals]: number }).inputCacheCreation +=
    source.inputCacheCreation;
  (target as { -readonly [K in keyof TokenTotals]: number }).total += source.total;
}

function isPriced(modelIndex: number): boolean {
  return MODELS[modelIndex].pricing !== null;
}

function pointCostCny(point: BasePoint): number {
  const pricing = MODELS[point.modelIndex].pricing;
  if (!pricing) return 0;
  const inputRate = Number.parseFloat(pricing.inputCnyPerMillion) / 1e6;
  const outputRate = Number.parseFloat(pricing.outputCnyPerMillion) / 1e6;
  const cacheRate = Number.parseFloat(pricing.cacheReadCnyPerMillion) / 1e6;
  return (
    point.tokens.inputOther * inputRate +
    point.tokens.inputCacheRead * cacheRate +
    point.tokens.inputCacheCreation * inputRate +
    point.tokens.output * outputRate
  );
}

function autoGranularity(rangeMs: number): Exclude<Granularity, "auto"> {
  if (rangeMs <= 6 * HOUR_MS) return "minute";
  if (rangeMs <= 4 * DAY_MS) return "hour";
  if (rangeMs <= 120 * DAY_MS) return "day";
  if (rangeMs <= 500 * DAY_MS) return "week";
  return "month";
}

function bucketStart(startMs: number, granularity: string): number {
  const date = new Date(startMs);
  switch (granularity) {
    case "minute":
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      ).getTime();
    case "hour":
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
      ).getTime();
    case "week": {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dow = (dayStart.getDay() + 6) % 7; // 周一为一周开始
      return dayStart.getTime() - dow * DAY_MS;
    }
    case "month":
      return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    default:
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
}

function matchesBilling(modelIndex: number, billing: BillingFilter): boolean {
  if (billing === "all") return true;
  return billing === "priced" ? isPriced(modelIndex) : !isPriced(modelIndex);
}

function filterPoints(
  points: readonly BasePoint[],
  filter: ScanFilter | null,
  rangeOverride?: { startMs: number; endMs: number },
): BasePoint[] {
  const startMs = rangeOverride?.startMs ?? filter?.startMs ?? null;
  const endMs = rangeOverride?.endMs ?? filter?.endMs ?? null;
  const models = filter?.models?.length ? new Set(filter.models) : null;
  const sessions = filter?.sessions?.length ? new Set(filter.sessions) : null;
  const agents = filter?.agents?.length ? new Set(filter.agents) : null;
  const scopes = filter?.scopes?.length ? new Set(filter.scopes) : null;
  const billing = filter?.billing ?? "all";
  return points.filter((point) => {
    if (startMs !== null && startMs !== undefined && point.startMs < startMs) return false;
    if (endMs !== null && endMs !== undefined && point.startMs > endMs) return false;
    if (models && !models.has(MODELS[point.modelIndex].model)) return false;
    if (sessions && !sessions.has(point.session)) return false;
    if (agents && !agents.has(point.agent)) return false;
    if (scopes && !scopes.has(point.scope)) return false;
    return matchesBilling(point.modelIndex, billing);
  });
}

function summarize(points: readonly BasePoint[]) {
  const tokens = emptyTokens();
  let requests = 0;
  let cost = 0;
  let unpricedRequests = 0;
  const sessions = new Set<string>();
  const costSegments = { inputOther: 0, cacheRead: 0, cacheCreation: 0, output: 0 };
  for (const point of points) {
    requests += point.requests;
    addTokens(tokens, point.tokens);
    sessions.add(point.session);
    const pricing = MODELS[point.modelIndex].pricing;
    if (pricing) {
      const inputRate = Number.parseFloat(pricing.inputCnyPerMillion) / 1e6;
      const outputRate = Number.parseFloat(pricing.outputCnyPerMillion) / 1e6;
      const cacheRate = Number.parseFloat(pricing.cacheReadCnyPerMillion) / 1e6;
      costSegments.inputOther += point.tokens.inputOther * inputRate;
      costSegments.cacheRead += point.tokens.inputCacheRead * cacheRate;
      costSegments.cacheCreation += point.tokens.inputCacheCreation * inputRate;
      costSegments.output += point.tokens.output * outputRate;
      cost += pointCostCny(point);
    } else {
      unpricedRequests += point.requests;
    }
  }
  const inputTotal = tokens.inputOther + tokens.inputCacheRead + tokens.inputCacheCreation;
  return {
    requests,
    sessions: sessions.size,
    tokens,
    cost,
    unpricedRequests,
    cacheHitRate: inputTotal > 0 ? tokens.inputCacheRead / inputTotal : 0,
    costSegments,
  };
}

function buildSeries(points: readonly BasePoint[], granularity: string): SeriesBucket[] {
  const buckets = new Map<number, { requests: number; tokens: TokenTotals; cost: number }>();
  for (const point of points) {
    const key = bucketStart(point.startMs, granularity);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { requests: 0, tokens: emptyTokens(), cost: 0 };
      buckets.set(key, bucket);
    }
    bucket.requests += point.requests;
    addTokens(bucket.tokens, point.tokens);
    bucket.cost += pointCostCny(point);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-2000)
    .map(([startMs, bucket]) => ({
      startMs,
      requests: bucket.requests,
      tokens: bucket.tokens,
      costCny: bucket.cost.toFixed(6),
    }));
}

function toDimension(values: Map<string, number>): DimensionValue[] {
  return [...values.entries()]
    .map(([value, requests]) => ({ value, requests }))
    .sort((a, b) => b.requests - a.requests);
}

let cachedBase: { anchorHourMs: number; points: BasePoint[] } | null = null;

/** 生成确定性的合成 UsageReport（纯浏览器 dev 预览用）。 */
export function generateMockReport(home: string, filter: ScanFilter | null): UsageReport {
  const nowMs = Date.now();
  const nowHourMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  if (!cachedBase || cachedBase.anchorHourMs !== nowHourMs) {
    cachedBase = { anchorHourMs: nowHourMs, points: buildBasePoints(nowHourMs) };
  }
  const base = cachedBase.points;

  const rangeMs =
    filter?.startMs != null && filter?.endMs != null
      ? filter.endMs - filter.startMs
      : BASE_HOURS * HOUR_MS;
  const granularity =
    !filter?.granularity || filter.granularity === "auto"
      ? autoGranularity(Math.max(rangeMs, HOUR_MS))
      : filter.granularity;

  const points = filterPoints(base, filter);
  const summary = summarize(points);

  // dimensions：只受时间范围约束
  const timeOnly = filterPoints(base, {
    startMs: filter?.startMs ?? null,
    endMs: filter?.endMs ?? null,
  });
  const modelsDim = new Map<string, number>();
  const sessionsDim = new Map<string, number>();
  const agentsDim = new Map<string, number>();
  const scopesDim = new Map<string, number>();
  for (const point of timeOnly) {
    const bump = (map: Map<string, number>, key: string) =>
      map.set(key, (map.get(key) ?? 0) + point.requests);
    bump(modelsDim, MODELS[point.modelIndex].model);
    bump(sessionsDim, point.session);
    bump(agentsDim, point.agent);
    bump(scopesDim, point.scope);
  }

  // comparison：等长上一周期；全部时间时为 null
  let comparison: UsageReport["comparison"] = null;
  if (filter?.startMs != null && filter?.endMs != null) {
    const length = filter.endMs - filter.startMs + 1;
    const prev = filterPoints(base, filter, {
      startMs: filter.startMs - length,
      endMs: filter.startMs - 1,
    });
    const prevSummary = summarize(prev);
    comparison = {
      requests: prevSummary.requests,
      sessions: prevSummary.sessions,
      tokens: prevSummary.tokens,
      cacheHitRate: prevSummary.cacheHitRate,
      pricedCostCny: prevSummary.cost.toFixed(6),
    };
  }

  // 模型维度
  const byModel = new Map<
    number,
    { requests: number; tokens: TokenTotals; cost: number; priced: boolean }
  >();
  for (const point of points) {
    let entry = byModel.get(point.modelIndex);
    if (!entry) {
      entry = {
        requests: 0,
        tokens: emptyTokens(),
        cost: 0,
        priced: isPriced(point.modelIndex),
      };
      byModel.set(point.modelIndex, entry);
    }
    entry.requests += point.requests;
    addTokens(entry.tokens, point.tokens);
    entry.cost += pointCostCny(point);
  }
  const models: ModelUsage[] = [...byModel.entries()]
    .map(([modelIndex, entry]) => {
      const inputTotal =
        entry.tokens.inputOther + entry.tokens.inputCacheRead + entry.tokens.inputCacheCreation;
      return {
        model: MODELS[modelIndex].model,
        aliases: MODELS[modelIndex].aliases,
        requests: entry.requests,
        tokens: entry.tokens,
        cacheHitRate: inputTotal > 0 ? entry.tokens.inputCacheRead / inputTotal : 0,
        costCny: entry.priced ? entry.cost.toFixed(6) : null,
        pricing: MODELS[modelIndex].pricing,
      };
    })
    .sort((a, b) => b.requests - a.requests);

  // 最近请求：从基线尾部展开，≤1000 条
  const recent: RecentUsage[] = [];
  const sorted = [...points].sort((a, b) => b.startMs - a.startMs);
  for (const point of sorted) {
    if (recent.length >= 1000) break;
    const count = Math.min(point.requests, 3);
    for (let index = 0; index < count && recent.length < 1000; index += 1) {
      const rand = mulberry32(point.startMs + index * 97);
      const scale = 0.5 + rand();
      const inputOther = Math.floor(point.tokens.inputOther / count / scale);
      const inputCacheRead = Math.floor(point.tokens.inputCacheRead / count / scale);
      const inputCacheCreation = Math.floor(point.tokens.inputCacheCreation / count / scale);
      const output = Math.floor(point.tokens.output / count / scale);
      const inputTotal = inputOther + inputCacheRead + inputCacheCreation;
      const pricing = MODELS[point.modelIndex].pricing;
      recent.push({
        time: point.startMs + Math.floor(rand() * HOUR_MS),
        model: MODELS[point.modelIndex].model,
        sessionId: point.session,
        agent: point.agent,
        scope: point.scope,
        tokens: {
          inputOther,
          output,
          inputCacheRead,
          inputCacheCreation,
          total: inputOther + output + inputCacheRead + inputCacheCreation,
        },
        cacheHitRate: inputTotal > 0 ? inputCacheRead / inputTotal : 0,
        durationMs: 800 + Math.floor(rand() * 179_200),
        costCny: pricing ? (pointCostCny(point) / count).toFixed(6) : null,
      });
    }
  }
  recent.sort((a, b) => b.time - a.time);

  return {
    home,
    generatedAt: nowMs,
    granularity,
    requests: summary.requests,
    sessions: summary.sessions,
    scannedFiles: 42,
    scannedLines: 128400,
    parsedRecords: summary.requests + 137,
    malformedRecords: 3,
    oversizedRecords: 1,
    limitsReached: false,
    unpricedRequests: summary.unpricedRequests,
    cacheHitRate: summary.cacheHitRate,
    pricedCostCny: summary.cost.toFixed(6),
    tokens: summary.tokens,
    costSegments: {
      inputOther: summary.costSegments.inputOther.toFixed(6),
      cacheRead: summary.costSegments.cacheRead.toFixed(6),
      cacheCreation: summary.costSegments.cacheCreation.toFixed(6),
      output: summary.costSegments.output.toFixed(6),
    },
    series: buildSeries(points, granularity),
    dimensions: {
      models: toDimension(modelsDim),
      sessions: toDimension(sessionsDim),
      agents: toDimension(agentsDim),
      scopes: toDimension(scopesDim),
    },
    comparison,
    models,
    recent,
  };
}

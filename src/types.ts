export type TokenTotals = Readonly<{
  inputOther: number;
  output: number;
  inputCacheRead: number;
  inputCacheCreation: number;
  total: number;
}>;

export type PricingMetadata = Readonly<{
  model: string;
  inputCnyPerMillion: string;
  outputCnyPerMillion: string;
  cacheReadCnyPerMillion: string;
  contextTokens: number;
  sourceUrl: string;
  verifiedOn: string;
}>;

export type SeriesBucket = Readonly<{
  startMs: number;
  requests: number;
  tokens: TokenTotals;
  costCny: string;
}>;

export type DimensionValue = Readonly<{
  value: string;
  requests: number;
}>;

export type FilterDimensions = Readonly<{
  models: readonly DimensionValue[];
  sessions: readonly DimensionValue[];
  agents: readonly DimensionValue[];
  scopes: readonly DimensionValue[];
}>;

export type ComparisonSummary = Readonly<{
  requests: number;
  sessions: number;
  tokens: TokenTotals;
  cacheHitRate: number;
  pricedCostCny: string;
}>;

export type CostSegments = Readonly<{
  inputOther: string;
  cacheRead: string;
  cacheCreation: string;
  output: string;
}>;

export type BillingFilter = "all" | "priced" | "unpriced";

export type Granularity = "auto" | "minute" | "hour" | "day" | "week" | "month";

export type ScanFilter = Readonly<{
  startMs?: number | null;
  endMs?: number | null;
  models?: readonly string[];
  sessions?: readonly string[];
  agents?: readonly string[];
  scopes?: readonly string[];
  billing?: BillingFilter;
  granularity?: Granularity;
}>;

export type ModelUsage = Readonly<{
  model: string;
  aliases: readonly string[];
  requests: number;
  tokens: TokenTotals;
  cacheHitRate: number;
  costCny: string | null;
  pricing: PricingMetadata | null;
}>;

export type RecentUsage = Readonly<{
  time: number;
  model: string;
  sessionId: string;
  agent: string;
  scope: string;
  tokens: TokenTotals;
  costCny: string | null;
}>;

export type UsageReport = Readonly<{
  home: string;
  generatedAt: number;
  granularity: string;
  requests: number;
  sessions: number;
  scannedFiles: number;
  scannedLines: number;
  parsedRecords: number;
  malformedRecords: number;
  oversizedRecords: number;
  limitsReached: boolean;
  unpricedRequests: number;
  cacheHitRate: number;
  pricedCostCny: string;
  tokens: TokenTotals;
  costSegments: CostSegments;
  series: readonly SeriesBucket[];
  dimensions: FilterDimensions;
  comparison: ComparisonSummary | null;
  models: readonly ModelUsage[];
  recent: readonly RecentUsage[];
}>;

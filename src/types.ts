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

export type DailyUsage = Readonly<{
  date: string;
  requests: number;
  tokens: TokenTotals;
  costCny: string;
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
  tokens: TokenTotals;
  costCny: string | null;
}>;

export type UsageReport = Readonly<{
  home: string;
  generatedAt: number;
  rangeDays: number | null;
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
  daily: readonly DailyUsage[];
  models: readonly ModelUsage[];
  recent: readonly RecentUsage[];
}>;

export type RangeDays = 1 | 7 | 30 | null;

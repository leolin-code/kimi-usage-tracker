import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  Coins,
  Database,
  Gauge,
  HardDriveUpload,
  Percent,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { computeDelta, formatDeltaRatio, type Delta } from "../../lib/report-utils.ts";
import { formatCny, formatPercent, formatTokens } from "../../report-model.ts";
import type { UsageReport } from "../../types.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { SimpleTooltip } from "../ui/tooltip.tsx";
import { Skeleton } from "../ui/skeleton.tsx";

type Tone = "blue" | "green" | "teal" | "orange" | "ink";

const TONE_STYLES: Record<Tone, string> = {
  blue: "bg-blue/10 text-blue",
  green: "bg-green/10 text-green",
  teal: "bg-teal/10 text-teal",
  orange: "bg-orange/10 text-orange",
  ink: "bg-muted text-muted-foreground",
};

type MetricDef = Readonly<{
  key: string;
  label: string;
  icon: ReactNode;
  tone: Tone;
  description: string;
  /** 升/降是否代表正向（命中率：升绿降红；其余中性着色） */
  sentiment: "good-up" | "neutral";
  current: (report: UsageReport) => number;
  previous: (report: UsageReport) => number | null;
  display: (report: UsageReport) => string;
  exact: (report: UsageReport) => string;
  deltaText?: (delta: Delta) => string;
  /** 有比例语义的卡片附加进度条（ratio 0~1 + 语义色 CSS 值） */
  bar?: (report: UsageReport) => { ratio: number; color: string } | null;
}>;

const getMetrics = (t: TFunction): readonly MetricDef[] => [
  {
    key: "total",
    label: t("metrics.total"),
    icon: <Database size={15} />,
    tone: "ink",
    description: t("metrics.totalDescription"),
    sentiment: "neutral",
    current: (r) => r.tokens.total,
    previous: (r) => r.comparison?.tokens.total ?? null,
    display: (r) => formatTokens(r.tokens.total),
    exact: (r) => `${formatTokens(r.tokens.total, false)} Token`,
  },
  {
    key: "input",
    label: t("metrics.input"),
    icon: <HardDriveUpload size={15} />,
    tone: "blue",
    description: t("metrics.inputDescription"),
    sentiment: "neutral",
    current: (r) => r.tokens.inputOther,
    previous: (r) => r.comparison?.tokens.inputOther ?? null,
    display: (r) => formatTokens(r.tokens.inputOther),
    exact: (r) => `${formatTokens(r.tokens.inputOther, false)} Token`,
  },
  {
    key: "cache-read",
    label: t("metrics.cacheRead"),
    icon: <Zap size={15} />,
    tone: "green",
    description: t("metrics.cacheReadDescription"),
    sentiment: "neutral",
    current: (r) => r.tokens.inputCacheRead,
    previous: (r) => r.comparison?.tokens.inputCacheRead ?? null,
    display: (r) => formatTokens(r.tokens.inputCacheRead),
    exact: (r) => `${formatTokens(r.tokens.inputCacheRead, false)} Token`,
    bar: (r) =>
      r.tokens.total > 0
        ? {
            ratio: r.tokens.inputCacheRead / r.tokens.total,
            color: "var(--green)",
          }
        : null,
  },
  {
    key: "output",
    label: t("metrics.output"),
    icon: <ArrowLeftRight size={15} />,
    tone: "orange",
    description: t("metrics.outputDescription"),
    sentiment: "neutral",
    current: (r) => r.tokens.output,
    previous: (r) => r.comparison?.tokens.output ?? null,
    display: (r) => formatTokens(r.tokens.output),
    exact: (r) => `${formatTokens(r.tokens.output, false)} Token`,
  },
  {
    key: "requests",
    label: t("metrics.requests"),
    icon: <Gauge size={15} />,
    tone: "ink",
    description: t("metrics.requestsDescription"),
    sentiment: "neutral",
    current: (r) => r.requests,
    previous: (r) => r.comparison?.requests ?? null,
    display: (r) => formatTokens(r.requests),
    exact: (r) => t("metrics.requestCount", { count: formatTokens(r.requests, false) }),
  },
  {
    key: "sessions",
    label: t("metrics.sessions"),
    icon: <Users size={15} />,
    tone: "ink",
    description: t("metrics.sessionsDescription"),
    sentiment: "neutral",
    current: (r) => r.sessions,
    previous: (r) => r.comparison?.sessions ?? null,
    display: (r) => formatTokens(r.sessions),
    exact: (r) => t("metrics.sessionCount", { count: formatTokens(r.sessions, false) }),
  },
  {
    key: "hit-rate",
    label: t("metrics.hitRate"),
    icon: <Percent size={15} />,
    tone: "green",
    description: t("metrics.hitRateDescription"),
    sentiment: "good-up",
    current: (r) => r.cacheHitRate,
    previous: (r) => r.comparison?.cacheHitRate ?? null,
    display: (r) => formatPercent(r.cacheHitRate),
    exact: (r) => formatPercent(r.cacheHitRate),
    bar: (r) => ({
      ratio: Math.max(0, Math.min(1, r.cacheHitRate)),
      color:
        r.cacheHitRate > 0.8
          ? "var(--green)"
          : r.cacheHitRate >= 0.5
            ? "var(--blue)"
            : "var(--orange)",
    }),
    deltaText: (delta) =>
      delta.ratio === null
        ? "—"
        : `${delta.ratio > 0 ? "+" : ""}${(delta.ratio * 100).toFixed(1)} pt`,
  },
  {
    key: "cost",
    label: t("metrics.cost"),
    icon: <Coins size={15} />,
    tone: "teal",
    description: t("metrics.costDescription"),
    sentiment: "neutral",
    current: (r) => Number.parseFloat(r.pricedCostCny) || 0,
    previous: (r) => (r.comparison ? Number.parseFloat(r.comparison.pricedCostCny) || 0 : null),
    display: (r) => formatCny(r.pricedCostCny, 2),
    exact: (r) => formatCny(r.pricedCostCny, 6),
  },
];

function DeltaChip({ metric, report }: { metric: MetricDef; report: UsageReport }) {
  if (!report.comparison) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const delta: Delta =
    metric.key === "hit-rate"
      ? {
          ratio:
            report.comparison.cacheHitRate > 0
              ? report.cacheHitRate - report.comparison.cacheHitRate
              : null,
          direction:
            report.cacheHitRate > report.comparison.cacheHitRate
              ? "up"
              : report.cacheHitRate < report.comparison.cacheHitRate
                ? "down"
                : "flat",
        }
      : computeDelta(metric.current(report), metric.previous(report));

  const Icon =
    delta.direction === "up"
      ? ArrowUpRight
      : delta.direction === "down"
        ? ArrowDownRight
        : ArrowRight;
  const color =
    delta.direction === "flat" || metric.sentiment === "neutral"
      ? "bg-muted text-muted-foreground"
      : delta.direction === "up"
        ? "bg-green/12 text-green"
        : "bg-red/12 text-red";
  const text = metric.deltaText ? metric.deltaText(delta) : formatDeltaRatio(delta.ratio);

  return (
    <span
      className={`tnum inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${color}`}
    >
      <Icon size={12} />
      {text}
    </span>
  );
}

export function MetricsGrid() {
  const { t } = useTranslation();
  const { report, initialLoading } = useDashboard();
  const metrics = getMetrics(t);

  if (initialLoading || !report) {
    return (
      <section aria-label={t("metrics.loading")} className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="surface-card px-3 py-2.5" key={index}>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="mt-1.5 h-8 w-20" />
            <Skeleton className="mt-1 h-5 w-12 rounded-full" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section aria-label={t("metrics.label")} className="grid grid-cols-4 gap-2.5">
      {metrics.map((metric) => (
        <SimpleTooltip
          key={metric.key}
          content={
            <span>
              {metric.description}
              <br />
              <span className="tnum font-medium">{metric.exact(report)}</span>
            </span>
          }
        >
          <div className="surface-card cursor-default px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md ${TONE_STYLES[metric.tone]}`}
              >
                {metric.icon}
              </span>
              <span className="truncate text-xs text-muted-foreground">{metric.label}</span>
            </div>
            <div className="tnum mt-0.5 flex h-8 min-w-20 items-center truncate text-[22px] leading-8 font-bold tracking-tight">
              {metric.display(report)}
            </div>
            <div className="mt-0.5 flex h-5 items-center">
              <DeltaChip metric={metric} report={report} />
            </div>
            {(() => {
              const bar = metric.bar?.(report);
              return bar ? (
                <div aria-hidden className="metric-track mt-1.5" title={formatPercent(bar.ratio)}>
                  <div
                    className="metric-bar"
                    style={{
                      width: `${Math.max(1.5, Math.min(100, bar.ratio * 100))}%`,
                      background: bar.color,
                    }}
                  />
                </div>
              ) : null;
            })()}
          </div>
        </SimpleTooltip>
      ))}
    </section>
  );
}

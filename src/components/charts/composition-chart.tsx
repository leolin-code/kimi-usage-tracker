import type { EChartsOption } from "echarts";
import { PieChart as PieChartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useECharts } from "../../hooks/use-echarts.ts";
import { useTheme } from "../../hooks/use-theme.tsx";
import { formatCny, formatPercent, formatTokens } from "../../report-model.ts";
import { tokenSegments } from "../../report-model.ts";
import { useDashboard, type TokenFocusKey } from "../../state/dashboard.tsx";
import { cn } from "../../lib/utils.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";

const SEGMENT_COLORS: Record<string, string> = {
  input: "var(--blue)",
  cache: "var(--green)",
  "cache-write": "var(--chart-5)",
  output: "var(--orange)",
};

const SEGMENT_COST_KEYS: Record<string, "inputOther" | "cacheRead" | "cacheCreation" | "output"> = {
  input: "inputOther",
  cache: "cacheRead",
  "cache-write": "cacheCreation",
  output: "output",
};

/** Token 构成环形图 + 右侧构成列表；点击扇区联动全局 tokenFocus。 */
export function CompositionChart() {
  const { t, i18n } = useTranslation();
  const { report, tokenFocus, setTokenFocus, refreshing } = useDashboard();
  const { themeVersion } = useTheme();

  const segments = report ? tokenSegments(report.tokens) : [];
  const total = report?.tokens.total ?? 0;

  const containerRef = useECharts(
    (palette): EChartsOption | null => {
      if (!report || total <= 0) return null;
      // ECharts 画布无法解析 CSS var()，必须传入具体颜色值
      const segmentColors: Record<string, string> = {
        input: palette.blue,
        cache: palette.green,
        "cache-write": palette.colors[4] || palette.teal,
        output: palette.orange,
      };
      return {
        animationDuration: 250,
        tooltip: {
          trigger: "item",
          backgroundColor: palette.card,
          borderWidth: 0,
          padding: [10, 12],
          textStyle: { color: palette.foreground, fontSize: 12 },
          extraCssText:
            "border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.28),0 2px 8px rgba(0,0,0,0.18);",
          formatter: (params) => {
            const item = params as { name: string; value: number; percent: number };
            return `${item.name}<br/><span style="font-variant-numeric:tabular-nums;font-weight:600">${formatTokens(item.value, false)} Token</span> · ${item.percent.toFixed(1)}%`;
          },
        },
        series: [
          {
            type: "pie",
            center: ["50%", "50%"],
            radius: ["60%", "78%"],
            avoidLabelOverlap: true,
            label: { show: false },
            labelLine: { show: false },
            itemStyle: {
              borderColor: palette.card,
              borderWidth: 2,
              borderRadius: 4,
            },
            emphasis: { scaleSize: 6 },
            data: segments.map((segment) => {
              const focused = tokenFocus === segment.key;
              const dimmed = tokenFocus !== null && !focused;
              return {
                name: segment.label,
                value: segment.value,
                itemStyle: {
                  color: segmentColors[segment.key],
                  opacity: dimmed ? 0.25 : 1,
                  shadowBlur: focused ? 10 : 0,
                  shadowColor: "rgba(0,0,0,0.25)",
                },
              };
            }),
          },
        ],
      };
    },
    [report, tokenFocus, total, themeVersion, i18n.resolvedLanguage],
    {
      click: (params) => {
        const name = (params as { name?: string }).name;
        const segment = segments.find((item) => item.label === name);
        if (segment) {
          setTokenFocus(tokenFocus === segment.key ? null : (segment.key as TokenFocusKey));
        }
      },
    },
  );

  // 点击扇区 → 设置/取消全局 tokenFocus
  const handleSegmentClick = (key: string) => {
    setTokenFocus(tokenFocus === key ? null : (key as TokenFocusKey));
  };

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader>
        <CardTitle>{t("charts.composition")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {!report || total <= 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
            <PieChartIcon size={32} strokeWidth={1.5} />
            <p className="text-sm">{t("charts.noToken")}</p>
          </div>
        ) : (
          <div className={cn("flex flex-col gap-1", refreshing ? "opacity-70" : "")}>
            <div className="relative">
              <div
                aria-label={t("charts.compositionAria")}
                className="h-40 w-full min-w-0"
                ref={containerRef}
                role="img"
              />
              {/* 中心总量用 HTML 覆盖层，避免 ECharts title 被环体遮挡 */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="tnum text-[17px] leading-6 font-bold tracking-tight">
                  {formatTokens(total)}
                </span>
                <span className="text-[11px] text-muted-foreground">{t("metrics.total")}</span>
              </div>
            </div>
            <ul className="grid w-full grid-cols-2 gap-x-1.5 gap-y-1">
              {segments.map((segment) => {
                const costKey = SEGMENT_COST_KEYS[segment.key];
                const cost = report.costSegments[costKey];
                const focused = tokenFocus === segment.key;
                return (
                  <li className="min-w-0" key={segment.key}>
                    <button
                      aria-pressed={focused}
                      className={cn(
                        "flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition-colors hover:bg-muted",
                        focused ? "bg-muted ring-1 ring-primary/40" : "",
                        tokenFocus && !focused ? "opacity-50" : "",
                      )}
                      title={`${segment.label} ${formatTokens(segment.value, false)} Token · ${formatCny(cost, 2)}`}
                      type="button"
                      onClick={() => handleSegmentClick(segment.key)}
                    >
                      <span className="flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: SEGMENT_COLORS[segment.key] }}
                        />
                        {segment.label}
                        <span className="tnum ml-auto text-muted-foreground">
                          {formatPercent(segment.ratio)}
                        </span>
                      </span>
                      <span className="flex items-baseline justify-between pl-4">
                        <span className="tnum text-[12px] font-medium">
                          {formatTokens(segment.value)}
                        </span>
                        <span className="tnum text-[11px] text-muted-foreground">
                          {formatCny(cost, 2)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

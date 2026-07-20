import * as echarts from "echarts";
import type { EChartsOption, SeriesOption } from "echarts";
import { LineChart as LineChartIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useECharts } from "../../hooks/use-echarts.ts";
import { useTheme } from "../../hooks/use-theme.tsx";
import { formatAxisLabel, granularityLabel, type Granularity } from "../../lib/report-utils.ts";
import { formatDateTime } from "../../report-model.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.tsx";
import { cn } from "../../lib/utils.ts";
import { exactValue, TREND_METRICS, type TrendMetricKey } from "./chart-metrics.ts";

const GRANULARITIES: readonly Granularity[] = ["auto", "minute", "hour", "day", "week", "month"];

/** #rrggbb → rgba()（ECharts 画布不能用 CSS var/颜色函数） */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function areaGradient(color: string, top: number) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: withAlpha(color, top) },
    { offset: 1, color: withAlpha(color, 0) },
  ]);
}

export function TrendChart() {
  const { t, i18n } = useTranslation();
  const { report, dispatch, tokenFocus, refreshing, filter } = useDashboard();
  const { themeVersion } = useTheme();
  const [selected, setSelected] = useState<readonly TrendMetricKey[]>(["total"]);

  const series = report?.series ?? [];
  const granularity = report?.granularity ?? "day";

  const toggleMetric = (key: TrendMetricKey) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.length > 1
          ? previous.filter((item) => item !== key)
          : previous
        : [...previous, key],
    );
  };

  const labels = useMemo(
    () => series.map((bucket) => formatAxisLabel(bucket.startMs, granularity)),
    [series, granularity],
  );

  const containerRef = useECharts(
    (palette): EChartsOption | null => {
      if (series.length === 0) return null;
      const active = TREND_METRICS.filter((metric) => selected.includes(metric.key));
      const focusSeriesKeys = tokenFocus
        ? TREND_METRICS.filter((m) => m.focusKey === tokenFocus).map((m) => m.key)
        : null;

      const echartsSeries: SeriesOption[] = active.map((metric) => {
        const dimmed = focusSeriesKeys !== null && !focusSeriesKeys.includes(metric.key);
        const color = metric.color(palette);
        return {
          name: t(metric.label),
          type: "line",
          yAxisIndex: metric.axis === "left" ? 0 : 1,
          data: series.map((bucket) => metric.value(bucket)),
          smooth: 0.3,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: {
            width: focusSeriesKeys?.includes(metric.key) ? 2.5 : 1.8,
            color,
            opacity: dimmed ? 0.15 : 1,
          },
          itemStyle: { color, opacity: dimmed ? 0.15 : 1 },
          areaStyle:
            metric.axis === "left"
              ? { color: areaGradient(color, dimmed ? 0.03 : 0.18), opacity: 1 }
              : undefined,
          emphasis: { focus: "series" },
          z: focusSeriesKeys?.includes(metric.key) ? 3 : 2,
        };
      });

      return {
        animationDuration: 250,
        grid: { top: 36, right: 52, bottom: 56, left: 56 },
        legend: {
          top: 0,
          left: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: palette.mutedForeground, fontSize: 11 },
        },
        toolbox: {
          right: 0,
          top: 0,
          feature: { dataZoom: { yAxisIndex: "none" } },
          iconStyle: { borderColor: palette.mutedForeground },
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: palette.border } },
          backgroundColor: palette.card,
          borderWidth: 0,
          padding: [10, 12],
          textStyle: { color: palette.foreground, fontSize: 12 },
          extraCssText:
            "border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.28),0 2px 8px rgba(0,0,0,0.18);",
          formatter: (params) => {
            const items = Array.isArray(params) ? params : [params];
            const index = (items[0] as { dataIndex?: number })?.dataIndex ?? 0;
            const bucket = series[index];
            if (!bucket) return "";
            const rows = active
              .map(
                (metric) =>
                  `<div style="display:flex;justify-content:space-between;gap:16px">
                    <span>${t(metric.label)}</span>
                    <span style="font-variant-numeric:tabular-nums;font-weight:600">${exactValue(metric.key, bucket)}</span>
                  </div>`,
              )
              .join("");
            return `<div style="margin-bottom:4px;color:${palette.mutedForeground}">${formatDateTime(bucket.startMs)} (${t("charts.tooltipGranularity", { value: granularityLabel(granularity) })})</div>${rows}`;
          },
        },
        xAxis: {
          type: "category",
          data: labels,
          boundaryGap: false,
          axisLine: { lineStyle: { color: palette.border, opacity: 0.7 } },
          axisTick: { show: false },
          axisLabel: {
            color: palette.mutedForeground,
            fontSize: 11,
            hideOverlap: true,
          },
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              color: palette.mutedForeground,
              fontSize: 11,
              formatter: (value: number) =>
                new Intl.NumberFormat(i18n.resolvedLanguage, { notation: "compact" }).format(value),
            },
            splitLine: { lineStyle: { color: palette.border, opacity: 0.6 } },
          },
          {
            type: "value",
            axisLabel: { color: palette.mutedForeground, fontSize: 11 },
            splitLine: { show: false },
          },
        ],
        dataZoom: [
          { type: "inside", throttle: 50 },
          {
            type: "slider",
            height: 16,
            bottom: 8,
            borderColor: "transparent",
            backgroundColor: "transparent",
            fillerColor: withAlpha(palette.colors[0], 0.1),
            dataBackground: {
              lineStyle: { color: palette.border },
              areaStyle: { color: palette.border, opacity: 0.25 },
            },
            selectedDataBackground: {
              lineStyle: { color: palette.mutedForeground, opacity: 0.4 },
              areaStyle: { color: palette.mutedForeground, opacity: 0.12 },
            },
            handleStyle: { color: palette.mutedForeground, borderColor: "transparent" },
            moveHandleStyle: { color: palette.mutedForeground, opacity: 0.4 },
            emphasis: { moveHandleStyle: { opacity: 0.7 } },
            textStyle: { color: palette.mutedForeground, fontSize: 10 },
          },
        ],
        series: echartsSeries,
      };
    },
    [series, labels, selected, tokenFocus, granularity, themeVersion, i18n.resolvedLanguage, t],
  );

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex-wrap gap-y-2">
        <CardTitle>{t("charts.trend")}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label={t("charts.metricSelection")} className="flex flex-wrap gap-1">
            {TREND_METRICS.map((metric) => (
              <button
                aria-pressed={selected.includes(metric.key)}
                className={cn(
                  "cursor-pointer rounded-full px-2 py-0.5 text-[11px] transition-colors",
                  selected.includes(metric.key)
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  tokenFocus && metric.focusKey && tokenFocus !== metric.focusKey
                    ? "opacity-40"
                    : "",
                )}
                key={metric.key}
                type="button"
                onClick={() => toggleMetric(metric.key)}
              >
                {t(metric.label)}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="bg-border h-4 w-px shrink-0" />
          <ToggleGroup
            aria-label={t("charts.granularity")}
            type="single"
            value={filter.granularity}
            onValueChange={(value) => {
              if (value) dispatch({ type: "setGranularity", value: value as Granularity });
            }}
          >
            {GRANULARITIES.map((item) => (
              <ToggleGroupItem
                key={item}
                title={
                  item === "auto"
                    ? t("charts.currentGranularity", { value: granularityLabel(granularity) })
                    : undefined
                }
                value={item}
              >
                {t(`granularity.${item}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {series.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-muted-foreground">
            <LineChartIcon size={32} strokeWidth={1.5} />
            <p className="text-sm">{t("charts.noTrend")}</p>
            <p className="text-xs">{t("charts.retryHint")}</p>
          </div>
        ) : (
          <div
            aria-label={t("charts.trendAria", { value: granularityLabel(granularity) })}
            className={cn("h-56 w-full min-w-0", refreshing ? "opacity-70" : "")}
            ref={containerRef}
            role="img"
          />
        )}
      </CardContent>
    </Card>
  );
}

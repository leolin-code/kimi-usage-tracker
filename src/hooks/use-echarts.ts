import * as echarts from "echarts";
import { useEffect, useRef, type RefObject } from "react";

export type ChartPalette = Readonly<{
  colors: string[];
  foreground: string;
  mutedForeground: string;
  border: string;
  card: string;
  green: string;
  teal: string;
  orange: string;
  amber: string;
  red: string;
  blue: string;
}>;

/** 从当前生效的 CSS 变量读取图表配色（跟随主题切换）。 */
export function readChartPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);
  const get = (name: string) => styles.getPropertyValue(name).trim();
  return {
    colors: [
      get("--chart-1"),
      get("--chart-2"),
      get("--chart-3"),
      get("--chart-4"),
      get("--chart-5"),
      get("--chart-6"),
      get("--chart-7"),
    ],
    foreground: get("--foreground"),
    mutedForeground: get("--muted-foreground"),
    border: get("--border"),
    card: get("--card"),
    green: get("--green"),
    teal: get("--teal"),
    orange: get("--orange"),
    amber: get("--amber"),
    red: get("--red"),
    blue: get("--blue"),
  };
}

/**
 * 轻量 ECharts React wrapper：
 * - 容器挂载时初始化，卸载时 dispose
 * - buildOption 返回值变化时 setOption（notMerge，保留 dataZoom 窗口）
 * - themeVersion 变化（主题切换）时同样重建 option，颜色全部来自 CSS 变量
 * - ResizeObserver 自适应容器尺寸
 */
export function useECharts(
  buildOption: (palette: ChartPalette) => echarts.EChartsOption | null,
  deps: readonly unknown[],
  events?: Record<string, (params: unknown) => void>,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const buildRef = useRef(buildOption);
  buildRef.current = buildOption;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const option = buildRef.current(readChartPalette());
    if (!option) return;
    // 保留用户当前的 dataZoom 窗口，避免数据刷新时缩放被重置
    // 注意：首次 setOption 之前 getOption() 返回 undefined
    const previous = chart.getOption() as
      | { dataZoom?: { start?: number; end?: number }[] }
      | undefined;
    const zoom = previous?.dataZoom?.[0];
    if (zoom && typeof zoom.start === "number" && Array.isArray(option.dataZoom)) {
      option.dataZoom = option.dataZoom.map((entry, index) =>
        index === 0 ? { ...entry, start: zoom.start, end: zoom.end } : entry,
      );
    }
    chart.setOption(option, { notMerge: true });
    const handlers = eventsRef.current;
    if (handlers) {
      for (const [event, handler] of Object.entries(handlers)) {
        chart.off(event);
        chart.on(event, handler);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}

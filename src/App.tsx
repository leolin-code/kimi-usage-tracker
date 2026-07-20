import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Activity,
  Archive,
  Clock3,
  Coins,
  Database,
  FolderOpen,
  Gauge,
  HardDrive,
  RefreshCw,
  ServerCog,
  Sparkles,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatCny,
  formatDateTime,
  formatPercent,
  formatTokens,
  shortModelName,
  tokenSegments,
} from "./report-model.ts";
import type { RangeDays, UsageReport } from "./types.ts";

const rangeOptions: ReadonlyArray<{ label: string; value: RangeDays }> = [
  { label: "今天", value: 1 },
  { label: "7 天", value: 7 },
  { label: "30 天", value: 30 },
  { label: "全部", value: null },
];

function App() {
  const [home, setHome] = useState("");
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const loadUsage = useCallback(async (targetHome: string, days: RangeDays) => {
    if (!targetHome) return;
    setLoading(true);
    setError("");
    try {
      const next = await invoke<UsageReport>("scan_usage", {
        days,
        home: targetHome,
      });
      setReport(next);
      localStorage.setItem("kimi-usage-home", targetHome);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const saved = localStorage.getItem("kimi-usage-home")?.trim();
      const initialHome = saved || (await invoke<string>("default_kimi_home"));
      setHome(initialHome);
      await loadUsage(initialHome, rangeDays);
    })().catch((reason) => {
      setError(String(reason));
      setLoading(false);
    });
  }, [loadUsage, rangeDays]);

  const selectHome = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Kimi Code 数据目录",
    });
    if (typeof selected !== "string") return;
    setHome(selected);
    await loadUsage(selected, rangeDays);
  };

  const changeRange = async (next: RangeDays) => {
    if (next === rangeDays) return;
    setRangeDays(next);
    await loadUsage(home, next);
  };

  const chartData = useMemo(
    () =>
      (report?.daily ?? []).map((day) => ({
        cache: day.tokens.inputCacheRead,
        date: day.date.slice(5),
        input: day.tokens.inputOther,
        output: day.tokens.output,
        requests: day.requests,
        total: day.tokens.total,
      })),
    [report],
  );
  const visibleChartData = chartData.slice(-30);
  const chartMax = Math.max(1, ...visibleChartData.map((day) => day.total));
  const chartLabelStep = Math.max(1, Math.ceil(visibleChartData.length / 7));

  const segments = report ? tokenSegments(report.tokens) : [];
  const hasPricedUsage = report !== null && Number.parseFloat(report.pricedCostCny) > 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Activity size={19} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Kimi Usage Tracker</strong>
            <small>Unofficial · Local only</small>
          </span>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={selectHome} title="切换数据目录">
            <FolderOpen size={17} />
          </button>
          <button
            className="icon-button"
            disabled={loading || !home}
            type="button"
            onClick={() => void loadUsage(home, rangeDays)}
            title="刷新统计"
          >
            <RefreshCw className={loading ? "spinning" : ""} size={17} />
          </button>
        </div>
      </header>

      <section className="workspace-header">
        <div>
          <p className="eyebrow">本地使用统计</p>
          <h1>Token 与缓存概览</h1>
          <p className="path-line" title={home}>
            <HardDrive size={14} />
            <span>{home || "正在定位 Kimi Code 数据目录"}</span>
          </p>
        </div>
        <div className="range-control" aria-label="统计时间范围">
          {rangeOptions.map((option) => (
            <button
              aria-pressed={rangeDays === option.value}
              className={rangeDays === option.value ? "active" : ""}
              key={option.label}
              type="button"
              onClick={() => void changeRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className="empty-state" role="alert">
          <FolderOpen size={24} />
          <h2>未找到可读取的 Kimi Code 会话</h2>
          <p>{error}</p>
          <button className="command-button" type="button" onClick={selectHome}>
            <FolderOpen size={16} />
            选择目录
          </button>
        </section>
      ) : report ? (
        <>
          <section className="metrics-strip" aria-label="用量摘要">
            <Metric
              icon={<Gauge size={17} />}
              label="总 Token"
              value={formatTokens(report.tokens.total)}
              detail={`${formatTokens(report.requests, false)} 次请求`}
              tone="ink"
            />
            <Metric
              icon={<Archive size={17} />}
              label="普通输入"
              value={formatTokens(report.tokens.inputOther)}
              detail={`${formatTokens(report.sessions, false)} 个会话`}
              tone="coral"
            />
            <Metric
              icon={<Sparkles size={17} />}
              label="模型输出"
              value={formatTokens(report.tokens.output)}
              detail={`${formatTokens(report.models.length, false)} 个模型`}
              tone="amber"
            />
            <Metric
              icon={<Zap size={17} />}
              label="缓存读取"
              value={formatTokens(report.tokens.inputCacheRead)}
              detail={`${formatPercent(report.cacheHitRate)} 命中率`}
              tone="green"
            />
            <Metric
              icon={<Coins size={17} />}
              label="按量费用"
              value={hasPricedUsage ? formatCny(report.pricedCostCny) : "未产生"}
              detail={`${formatTokens(report.unpricedRequests, false)} 次订阅用量未定价`}
              tone="teal"
            />
          </section>

          <section className="primary-grid">
            <article className="panel trend-panel">
              <PanelHeader
                icon={<Activity size={17} />}
                title="每日用量"
                meta={`${chartData.length} 个统计日`}
              />
              <div className="chart-frame">
                {visibleChartData.length > 0 ? (
                  <div className="bar-chart" role="img" aria-label="每日 Token 使用趋势">
                    <div className="chart-scale" aria-hidden="true">
                      <span>{formatTokens(chartMax)}</span>
                      <span>{formatTokens(chartMax / 2)}</span>
                      <span>0</span>
                    </div>
                    <div className="chart-bars">
                      {visibleChartData.map((day, index) => (
                        <div className="chart-column" key={day.date}>
                          <div className="chart-bar-track">
                            <span
                              className="chart-bar-value"
                              style={{ height: `${Math.max(2, (day.total / chartMax) * 100)}%` }}
                              title={`${day.date} · ${formatTokens(day.total, false)} Token · ${day.requests} 次请求`}
                            />
                          </div>
                          <small>
                            {index % chartLabelStep === 0 || index === visibleChartData.length - 1
                              ? day.date
                              : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="chart-empty">当前范围暂无用量</div>
                )}
              </div>
            </article>

            <article className="panel composition-panel">
              <PanelHeader icon={<Database size={17} />} title="Token 构成" meta="缓存口径已拆分" />
              <div className="composition-total">
                <strong>{formatTokens(report.tokens.total, false)}</strong>
                <span>实际处理 Token</span>
              </div>
              <div className="composition-bar" aria-label="Token 构成比例">
                {segments.map((segment) =>
                  segment.value > 0 ? (
                    <span
                      className={`segment segment-${segment.key}`}
                      key={segment.key}
                      style={{ width: `${segment.ratio * 100}%` }}
                      title={`${segment.label} ${formatTokens(segment.value, false)}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="composition-list">
                {segments.map((segment) => (
                  <div key={segment.key}>
                    <span className={`legend-dot dot-${segment.key}`} />
                    <span>{segment.label}</span>
                    <strong>{formatTokens(segment.value, false)}</strong>
                    <small>{formatPercent(segment.ratio)}</small>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel table-panel">
            <PanelHeader
              icon={<ServerCog size={17} />}
              title="模型统计"
              meta={`${report.models.length} 个模型`}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>请求</th>
                    <th>普通输入</th>
                    <th>缓存读取</th>
                    <th>输出</th>
                    <th>命中率</th>
                    <th>费用</th>
                  </tr>
                </thead>
                <tbody>
                  {report.models.map((model) => (
                    <tr key={model.model}>
                      <td>
                        <div className="model-cell">
                          <strong>{shortModelName(model.model)}</strong>
                          <span>
                            {model.aliases.length > 0 ? `别名：${model.aliases.join("、")} · ` : ""}
                            {model.pricing ? "开放平台按量" : "订阅或未定价"}
                          </span>
                        </div>
                      </td>
                      <td>{formatTokens(model.requests, false)}</td>
                      <td>{formatTokens(model.tokens.inputOther, false)}</td>
                      <td>{formatTokens(model.tokens.inputCacheRead, false)}</td>
                      <td>{formatTokens(model.tokens.output, false)}</td>
                      <td>{formatPercent(model.cacheHitRate)}</td>
                      <td className={model.costCny === null ? "muted-value" : "cost-value"}>
                        {formatCny(model.costCny)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel table-panel recent-panel">
            <PanelHeader
              icon={<Clock3 size={17} />}
              title="最近请求"
              meta={`${report.scannedFiles} 个日志文件 · ${report.parsedRecords} 条记录`}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>Agent</th>
                    <th>输入</th>
                    <th>缓存</th>
                    <th>输出</th>
                    <th>总量</th>
                    <th>费用</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent.map((entry, index) => (
                    <tr key={`${entry.sessionId}-${entry.agent}-${entry.time}-${index}`}>
                      <td>{formatDateTime(entry.time)}</td>
                      <td className="recent-model">{shortModelName(entry.model)}</td>
                      <td>{entry.agent}</td>
                      <td>{formatTokens(entry.tokens.inputOther, false)}</td>
                      <td>{formatTokens(entry.tokens.inputCacheRead, false)}</td>
                      <td>{formatTokens(entry.tokens.output, false)}</td>
                      <td>{formatTokens(entry.tokens.total, false)}</td>
                      <td className={entry.costCny === null ? "muted-value" : "cost-value"}>
                        {formatCny(entry.costCny, 6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="footer-status">
            <span>本地只读</span>
            <span>更新于 {formatDateTime(report.generatedAt)}</span>
            {report.malformedRecords + report.oversizedRecords > 0 ? (
              <span>{report.malformedRecords + report.oversizedRecords} 条记录已安全跳过</span>
            ) : null}
            {report.limitsReached ? <span>达到安全扫描上限，结果可能为部分统计</span> : null}
          </footer>
        </>
      ) : (
        <section className="loading-state">
          <RefreshCw className="spinning" size={20} />
          正在读取本地使用记录
        </section>
      )}
    </main>
  );
}

function Metric({
  detail,
  icon,
  label,
  tone,
  value,
}: Readonly<{
  detail: string;
  icon: React.ReactNode;
  label: string;
  tone: "amber" | "coral" | "green" | "ink" | "teal";
  value: string;
}>) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelHeader({
  icon,
  meta,
  title,
}: Readonly<{ icon: React.ReactNode; meta: string; title: string }>) {
  return (
    <header className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
    </header>
  );
}

export default App;

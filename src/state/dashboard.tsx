import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { defaultKimiHome, scanUsage } from "../lib/api.ts";
import {
  buildScanFilter,
  DEFAULT_FILTER_STATE,
  type BillingFilter,
  type FilterState,
  type MultiFilter,
  type QuickRangeKey,
} from "../lib/report-utils.ts";
import type { Granularity, UsageReport } from "../types.ts";

const HOME_KEY = "kimi-usage-home";
const FILTER_KEY = "kimi-usage-filter-v1";
export const DEFAULT_RANGE_KEY = "kimi-usage-default-range";

export type TokenFocusKey = "input" | "cache" | "cache-write" | "output";

/* ---------------------------------------------------------------------------
 * 筛选 reducer
 * ------------------------------------------------------------------------- */

export type FilterAction =
  | { type: "setQuickRange"; key: QuickRangeKey }
  | { type: "setCustomRange"; startMs: number | null; endMs: number | null }
  | {
      type: "setMulti";
      key: "models" | "sessions" | "agents" | "scopes";
      value: MultiFilter;
    }
  | { type: "setBilling"; value: BillingFilter }
  | { type: "setGranularity"; value: Granularity }
  | { type: "restore"; state: FilterState }
  | { type: "reset" };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "setQuickRange":
      return { ...state, quickRange: action.key };
    case "setCustomRange":
      return {
        ...state,
        quickRange: "custom",
        customStartMs: action.startMs,
        customEndMs: action.endMs,
      };
    case "setMulti":
      return { ...state, [action.key]: action.value };
    case "setBilling":
      return { ...state, billing: action.value };
    case "setGranularity":
      return { ...state, granularity: action.value };
    case "restore":
      return action.state;
    case "reset":
      return { ...DEFAULT_FILTER_STATE };
  }
}

function readDefaultRange(): QuickRangeKey {
  const saved = localStorage.getItem(DEFAULT_RANGE_KEY);
  const valid: QuickRangeKey[] = [
    "today",
    "yesterday",
    "last24h",
    "last7d",
    "last30d",
    "thisMonth",
    "lastMonth",
    "all",
  ];
  return valid.includes(saved as QuickRangeKey) ? (saved as QuickRangeKey) : "last30d";
}

function readPersistedFilter(): FilterState {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as FilterState;
    // 轻量校验，损坏时回退默认
    if (typeof parsed.quickRange !== "string") throw new Error("bad");
    return { ...DEFAULT_FILTER_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_FILTER_STATE, quickRange: readDefaultRange() };
  }
}

/* ---------------------------------------------------------------------------
 * Dashboard context
 * ------------------------------------------------------------------------- */

type DashboardContextValue = Readonly<{
  home: string;
  report: UsageReport | null;
  /** 初次加载（无数据时） */
  initialLoading: boolean;
  /** 刷新中（保留旧数据，仅局部 loading） */
  refreshing: boolean;
  error: string | null;
  filter: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  tokenFocus: TokenFocusKey | null;
  setTokenFocus: (focus: TokenFocusKey | null) => void;
  refresh: () => void;
  changeHome: (nextHome: string) => void;
}>;

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [home, setHome] = useState(() => localStorage.getItem(HOME_KEY)?.trim() ?? "");
  const [report, setReport] = useState<UsageReport | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, dispatch] = useReducer(filterReducer, undefined, () => readPersistedFilter());
  const [tokenFocus, setTokenFocus] = useState<TokenFocusKey | null>(null);

  const requestId = useRef(0);
  const homeRef = useRef(home);
  homeRef.current = home;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const dimensionsRef = useRef<UsageReport["dimensions"] | null>(null);
  dimensionsRef.current = report?.dimensions ?? dimensionsRef.current;

  const load = useCallback(async () => {
    const targetHome = homeRef.current;
    if (!targetHome) return;
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const scanFilter = buildScanFilter(filterRef.current, dimensionsRef.current);
      const next = await scanUsage(targetHome, scanFilter);
      if (id !== requestId.current) return;
      setReport(next);
      setError(null);
    } catch (reason) {
      if (id !== requestId.current) return;
      setError(String(reason));
    } finally {
      if (id === requestId.current) {
        setRefreshing(false);
        setInitialLoading(false);
      }
    }
  }, []);

  // 初始化：定位数据目录
  useEffect(() => {
    void (async () => {
      if (!homeRef.current) {
        try {
          const detected = await defaultKimiHome();
          homeRef.current = detected;
          setHome(detected);
        } catch (reason) {
          setError(String(reason));
          setInitialLoading(false);
          return;
        }
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 筛选变化：持久化 + 防抖 400ms 重新扫描（跳过挂载时的首次触发，避免与初始化重复）
  const skipFirstFilterEffect = useRef(true);
  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    if (skipFirstFilterEffect.current) {
      skipFirstFilterEffect.current = false;
      return;
    }
    const timer = setTimeout(() => void load(), 400);
    return () => clearTimeout(timer);
  }, [filter, load]);

  const refresh = useCallback(() => void load(), [load]);

  const changeHome = useCallback(
    (nextHome: string) => {
      localStorage.setItem(HOME_KEY, nextHome);
      dimensionsRef.current = null;
      setHome(nextHome);
      homeRef.current = nextHome;
      void load();
    },
    [load],
  );

  const value = useMemo(
    () => ({
      home,
      report,
      initialLoading,
      refreshing,
      error,
      filter,
      dispatch,
      tokenFocus,
      setTokenFocus,
      refresh,
      changeHome,
    }),
    [home, report, initialLoading, refreshing, error, filter, tokenFocus, refresh, changeHome],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard 必须在 DashboardProvider 内使用");
  return context;
}

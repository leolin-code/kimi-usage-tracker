import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "kimi-usage-theme";

type ThemeContextValue = Readonly<{
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** 每次解析主题变化时递增，用于驱动 ECharts 重建 */
  themeVersion: number;
  setPreference: (next: ThemePreference) => void;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readPreference(): ThemePreference {
  // URL 覆盖（?theme=light|dark|system）优先，便于两主题截图验证
  const override = new URLSearchParams(window.location.search).get("theme");
  if (override === "light" || override === "dark" || override === "system") {
    return override;
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readPreference() === "system" ? systemTheme() : (readPreference() as ResolvedTheme),
  );
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const apply = (next: ResolvedTheme) => {
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      setResolved((previous) => {
        if (previous !== next) setThemeVersion((version) => version + 1);
        return next;
      });
    };

    if (preference !== "system") {
      apply(preference);
      return;
    }
    apply(systemTheme());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(systemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, themeVersion, setPreference }),
    [preference, resolved, themeVersion, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return context;
}

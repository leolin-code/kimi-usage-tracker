import { Activity, FolderOpen, Monitor, Moon, RefreshCw, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDateTime } from "../../report-model.ts";
import { pickHomeDirectory } from "../../lib/api.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { useTheme, type ThemePreference } from "../../hooks/use-theme.tsx";
import { Button } from "../ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { SimpleTooltip } from "../ui/tooltip.tsx";
import { SettingsDialog } from "./settings-dialog.tsx";

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  labelKey: string;
  icon: typeof Sun;
}> = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "system", labelKey: "theme.system", icon: Monitor },
];

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { home, report, refreshing, refresh, changeHome } = useDashboard();
  const { preference, resolved, setPreference } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectHome = async () => {
    const selected = await pickHomeDirectory();
    if (selected) changeHome(selected);
  };

  const ThemeIcon = resolved === "dark" ? Moon : Sun;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90">
      <div className="mx-auto flex h-13 max-w-[1440px] items-center gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Activity size={13} strokeWidth={2.2} />
          </span>
          <strong className="shrink-0 text-[13px] font-semibold tracking-tight">
            Kimi Usage Tracker
          </strong>
          <SimpleTooltip content={home || t("topbar.noDirectory")}>
            <span className="hidden max-w-56 truncate text-xs text-muted-foreground md:inline">
              {home}
            </span>
          </SimpleTooltip>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <SimpleTooltip content={t("topbar.switchDirectory")}>
            <Button
              aria-label={t("topbar.switchDirectory")}
              size="icon"
              variant="ghost"
              onClick={selectHome}
            >
              <FolderOpen size={16} />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip
            content={
              report
                ? t("topbar.updatedAt", { time: formatDateTime(report.generatedAt) })
                : t("topbar.refresh")
            }
          >
            <Button
              aria-label={t("topbar.refresh")}
              disabled={refreshing || !home}
              size="icon"
              variant="ghost"
              onClick={refresh}
            >
              <RefreshCw className={refreshing ? "animate-spin-slow" : ""} size={16} />
            </Button>
          </SimpleTooltip>
          {report ? (
            <span className="tnum hidden text-xs text-muted-foreground lg:inline">
              {t("topbar.updated", { time: formatDateTime(report.generatedAt) })}
            </span>
          ) : null}

          <DropdownMenu>
            <SimpleTooltip content={t("theme.label")}>
              <DropdownMenuTrigger asChild>
                <Button aria-label={t("theme.switch")} size="icon" variant="ghost">
                  <ThemeIcon size={16} />
                </Button>
              </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent align="end">
              {THEME_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.value} onClick={() => setPreference(option.value)}>
                  <option.icon size={14} />
                  {t(option.labelKey)}
                  {preference === option.value ? (
                    <span className="ml-auto text-primary">✓</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <SimpleTooltip content={t("language.label")}>
              <DropdownMenuTrigger asChild>
                <Button aria-label={t("language.label")} size="icon" variant="ghost">
                  <span className="text-[11px] font-semibold">
                    {i18n.resolvedLanguage === "en-US" ? "EN" : "中"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void i18n.changeLanguage("zh-CN")}>
                {t("language.zh")}
                {i18n.resolvedLanguage === "zh-CN" ? (
                  <span className="ml-auto text-primary">✓</span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void i18n.changeLanguage("en-US")}>
                {t("language.en")}
                {i18n.resolvedLanguage === "en-US" ? (
                  <span className="ml-auto text-primary">✓</span>
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <SimpleTooltip content={t("topbar.settings")}>
            <Button
              aria-label={t("topbar.settings")}
              size="icon"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}

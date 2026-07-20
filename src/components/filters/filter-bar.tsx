import { ChevronDown, ChevronUp, RotateCcw, Save, Bookmark } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  activeFilterCount,
  QUICK_RANGE_ORDER,
  quickRangeLabel,
  resolveQuickRange,
  timezoneLabel,
  type QuickRangeKey,
} from "../../lib/report-utils.ts";
import { deletePreset, readPresets, savePreset, type FilterPreset } from "../../lib/presets.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Input } from "../ui/input.tsx";
import { Separator } from "../ui/separator.tsx";
import { SimpleTooltip } from "../ui/tooltip.tsx";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.tsx";
import { DateTimePicker } from "./date-time-picker.tsx";
import { MultiSelect } from "./multi-select.tsx";

export function FilterBar() {
  const { t } = useTranslation();
  const { filter, dispatch, report } = useDashboard();
  const [expanded, setExpanded] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<FilterPreset[]>(() => readPresets());

  const dimensions = report?.dimensions ?? null;
  const range = resolveQuickRange(filter.quickRange, new Date(), {
    startMs: filter.customStartMs,
    endMs: filter.customEndMs,
  });
  const advancedCount =
    (filter.models.selected.length > 0 ? 1 : 0) +
    (filter.sessions.selected.length > 0 ? 1 : 0) +
    (filter.agents.selected.length > 0 ? 1 : 0) +
    (filter.scopes.selected.length > 0 ? 1 : 0) +
    (filter.billing !== "all" ? 1 : 0);

  const setCustom = (startMs: number | null, endMs: number | null) => {
    if (startMs !== null && endMs !== null && startMs > endMs) {
      // 自动交换，保证 start ≤ end
      dispatch({ type: "setCustomRange", startMs: endMs, endMs: startMs });
      return;
    }
    dispatch({ type: "setCustomRange", startMs, endMs });
  };

  return (
    <section aria-label={t("filters.label")} className="surface-card px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          aria-label={t("filters.quickRange")}
          type="single"
          value={filter.quickRange === "custom" ? "" : filter.quickRange}
          onValueChange={(key) => {
            if (key) dispatch({ type: "setQuickRange", key: key as QuickRangeKey });
          }}
        >
          {QUICK_RANGE_ORDER.map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {quickRangeLabel(key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Separator className="h-5" orientation="vertical" />

        <DateTimePicker
          ariaLabel={t("filters.customStart")}
          inclusiveSecond={false}
          placeholder={t("filters.start")}
          value={range.startMs}
          onChange={(ms) => setCustom(ms, filter.customEndMs ?? range.endMs)}
        />
        <span className="text-xs text-muted-foreground">{t("filters.to")}</span>
        <DateTimePicker
          ariaLabel={t("filters.customEnd")}
          inclusiveSecond
          placeholder={t("filters.end")}
          value={range.endMs}
          onChange={(ms) => setCustom(filter.customStartMs ?? range.startMs, ms)}
        />
        <SimpleTooltip content={t("filters.localTimezone")}>
          <span className="text-xs text-muted-foreground">{timezoneLabel()}</span>
        </SimpleTooltip>

        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Bookmark size={13} />
                {t("filters.presets")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t("filters.savePreset")}</DropdownMenuLabel>
              <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
                <Input
                  aria-label={t("filters.presetName")}
                  className="h-7 text-xs"
                  placeholder={t("filters.presetName")}
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                />
                <Button
                  disabled={!presetName.trim()}
                  size="sm"
                  onClick={() => {
                    setPresets(savePreset(presetName, filter));
                    setPresetName("");
                  }}
                >
                  <Save size={13} />
                </Button>
              </div>
              <DropdownMenuSeparator />
              {presets.length === 0 ? (
                <DropdownMenuLabel>{t("filters.noPresets")}</DropdownMenuLabel>
              ) : (
                presets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.name}
                    className="justify-between"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <button
                      className="flex-1 cursor-pointer truncate text-left"
                      type="button"
                      onClick={() => dispatch({ type: "restore", state: preset.state })}
                    >
                      {preset.name}
                    </button>
                    <button
                      aria-label={t("filters.deletePreset", { name: preset.name })}
                      className="cursor-pointer text-muted-foreground hover:text-red"
                      type="button"
                      onClick={() => setPresets(deletePreset(preset.name))}
                    >
                      ×
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <SimpleTooltip content={t("filters.resetTooltip")}>
            <Button
              aria-label={t("filters.reset")}
              disabled={activeFilterCount(filter) === 0}
              size="sm"
              variant="ghost"
              onClick={() => dispatch({ type: "reset" })}
            >
              <RotateCcw size={13} />
              {t("filters.reset")}
            </Button>
          </SimpleTooltip>

          <Button
            aria-expanded={expanded}
            size="sm"
            variant={advancedCount > 0 ? "secondary" : "outline"}
            onClick={() => setExpanded((value) => !value)}
          >
            {t("filters.advanced")}
            {advancedCount > 0 ? <Badge>{advancedCount}</Badge> : null}
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <MultiSelect
            label={t("filters.model")}
            options={dimensions?.models ?? []}
            value={filter.models}
            onChange={(value) => dispatch({ type: "setMulti", key: "models", value })}
          />
          <MultiSelect
            label={t("filters.session")}
            options={dimensions?.sessions ?? []}
            value={filter.sessions}
            onChange={(value) => dispatch({ type: "setMulti", key: "sessions", value })}
          />
          <MultiSelect
            label={t("filters.scope")}
            options={dimensions?.scopes ?? []}
            value={filter.scopes}
            onChange={(value) => dispatch({ type: "setMulti", key: "scopes", value })}
          />
          <MultiSelect
            label={t("filters.agent")}
            options={dimensions?.agents ?? []}
            value={filter.agents}
            onChange={(value) => dispatch({ type: "setMulti", key: "agents", value })}
          />
          <Separator className="h-5" orientation="vertical" />
          <span className="text-xs text-muted-foreground">{t("filters.billing")}</span>
          <ToggleGroup
            aria-label={t("filters.billing")}
            type="single"
            value={filter.billing}
            onValueChange={(value) => {
              if (value)
                dispatch({
                  type: "setBilling",
                  value: value as "all" | "priced" | "unpriced",
                });
            }}
          >
            <ToggleGroupItem value="all">{t("common.all")}</ToggleGroupItem>
            <ToggleGroupItem value="priced">{t("filters.priced")}</ToggleGroupItem>
            <ToggleGroupItem value="unpriced">{t("filters.subscription")}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}
    </section>
  );
}

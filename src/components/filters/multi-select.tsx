import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatTokens } from "../../report-model.ts";
import type { MultiFilter, MultiMode } from "../../lib/report-utils.ts";
import type { DimensionValue } from "../../types.ts";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import { Input } from "../ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { ScrollArea } from "../ui/scroll-area.tsx";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group.tsx";

/**
 * 多选筛选器：搜索 / 全选 / 清空 / include-exclude 模式切换。
 * exclude 模式在组装参数时转换为「全集减去选中」。
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: readonly DimensionValue[];
  value: MultiFilter;
  onChange: (next: MultiFilter) => void;
}>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => option.value.toLowerCase().includes(keyword));
  }, [options, query]);

  const selectedSet = useMemo(() => new Set(value.selected), [value.selected]);

  const toggle = (optionValue: string) => {
    const next = new Set(selectedSet);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onChange({ ...value, selected: [...next] });
  };

  const setMode = (mode: string) => {
    if (mode === "include" || mode === "exclude") {
      onChange({ ...value, mode: mode as MultiMode });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="max-w-44" size="sm" variant="outline">
          <span className="truncate">{label}</span>
          {value.selected.length > 0 ? (
            <Badge variant={value.mode === "exclude" ? "amber" : "default"}>
              {value.mode === "exclude"
                ? t("filters.excludedCount", { count: value.selected.length })
                : value.selected.length}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">{t("common.all")}</span>
          )}
          <ChevronDown size={13} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="flex items-center gap-2 px-1 pb-2">
          <div className="relative flex-1">
            <Search
              className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
              size={13}
            />
            <Input
              aria-label={t("filters.search", { label })}
              className="h-7 pl-7 text-xs"
              placeholder={t("filters.search", { label })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToggleGroup
            aria-label={t("filters.mode")}
            type="single"
            value={value.mode}
            onValueChange={(mode) => mode && setMode(mode)}
          >
            <ToggleGroupItem className="px-2" value="include">
              {t("filters.include")}
            </ToggleGroupItem>
            <ToggleGroupItem className="px-2" value="exclude">
              {t("filters.exclude")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-1 px-1 pb-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange({ ...value, selected: filtered.map((o) => o.value) })}
          >
            {t("filters.selectAll")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, selected: [] })}>
            {t("filters.none")}
          </Button>
          <span className="ml-auto pr-1 text-xs text-muted-foreground">
            {value.mode === "exclude" ? t("filters.excludeHint") : t("filters.includeHint")}
          </span>
        </div>
        <ScrollArea className="h-56">
          <div className="space-y-0.5 pr-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t("filters.noMatch")}
              </p>
            ) : (
              filtered.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-[13px] hover:bg-muted"
                  key={option.value}
                >
                  <Checkbox
                    checked={selectedSet.has(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span className="min-w-0 flex-1 truncate" title={option.value}>
                    {option.value}
                  </span>
                  <span className="tnum text-xs text-muted-foreground">
                    {formatTokens(option.requests, false)}
                  </span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

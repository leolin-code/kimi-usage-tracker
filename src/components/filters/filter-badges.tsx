import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { quickRangeLabel, resolveQuickRange } from "../../lib/report-utils.ts";
import { formatDateTime } from "../../report-model.ts";
import { useDashboard } from "../../state/dashboard.tsx";

function ClosableBadge({ label, onClose }: Readonly<{ label: string; onClose: () => void }>) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
      <button
        aria-label={t("filters.remove", { label })}
        className="cursor-pointer rounded-full transition-colors hover:text-foreground"
        type="button"
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </span>
  );
}

/** 当前生效筛选条件的可关闭 badge 行。 */
export function FilterBadges() {
  const { t } = useTranslation();
  const { filter, dispatch } = useDashboard();

  const badges: { key: string; label: string; onClose: () => void }[] = [];

  if (filter.quickRange !== "last30d") {
    const range = resolveQuickRange(filter.quickRange, new Date(), {
      startMs: filter.customStartMs,
      endMs: filter.customEndMs,
    });
    const rangeText =
      filter.quickRange === "custom"
        ? `${range.startMs ? formatDateTime(range.startMs) : "…"} ~ ${range.endMs ? formatDateTime(range.endMs) : "…"}`
        : quickRangeLabel(filter.quickRange);
    badges.push({
      key: "range",
      label: t("filters.timeBadge", { value: rangeText }),
      onClose: () => dispatch({ type: "setQuickRange", key: "last30d" }),
    });
  }

  const multis = [
    { key: "models" as const, label: t("filters.model"), value: filter.models },
    { key: "sessions" as const, label: t("filters.session"), value: filter.sessions },
    { key: "scopes" as const, label: t("filters.scope"), value: filter.scopes },
    { key: "agents" as const, label: t("filters.agent"), value: filter.agents },
  ];
  for (const multi of multis) {
    if (multi.value.selected.length === 0) continue;
    const preview = multi.value.selected.slice(0, 2).join("、");
    const suffix =
      multi.value.selected.length > 2
        ? t("filters.moreItems", { count: multi.value.selected.length })
        : "";
    badges.push({
      key: multi.key,
      label: t("filters.multiBadge", {
        label: multi.label,
        mode: multi.value.mode === "exclude" ? t("filters.excludeMode") : "",
        value: preview,
        suffix,
      }),
      onClose: () =>
        dispatch({
          type: "setMulti",
          key: multi.key,
          value: { ...multi.value, selected: [] },
        }),
    });
  }

  if (filter.billing !== "all") {
    badges.push({
      key: "billing",
      label: t("filters.billingBadge", {
        value: filter.billing === "priced" ? t("filters.priced") : t("filters.subscription"),
      }),
      onClose: () => dispatch({ type: "setBilling", value: "all" }),
    });
  }

  if (badges.length === 0) return null;

  return (
    <div aria-label={t("filters.activeLabel")} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t("filters.active")}</span>
      {badges.map((badge) => (
        <ClosableBadge key={badge.key} label={badge.label} onClose={badge.onClose} />
      ))}
    </div>
  );
}

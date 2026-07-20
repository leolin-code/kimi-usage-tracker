import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { quickRangeLabel, type QuickRangeKey } from "../../lib/report-utils.ts";
import { formatDateTime, formatTokens } from "../../report-model.ts";
import { DEFAULT_RANGE_KEY, useDashboard } from "../../state/dashboard.tsx";
import { Button } from "../ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog.tsx";
import { Label } from "../ui/input.tsx";
import { Separator } from "../ui/separator.tsx";

const LOCAL_KEYS = [
  "kimi-usage-filter-v1",
  "kimi-usage-presets-v1",
  "kimi-usage-model-table-v1",
  "kimi-usage-default-range",
] as const;

const RANGE_CHOICES: readonly QuickRangeKey[] = [
  "today",
  "yesterday",
  "last24h",
  "last7d",
  "last30d",
  "thisMonth",
  "lastMonth",
  "all",
];

export function SettingsDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t } = useTranslation();
  const { report, dispatch } = useDashboard();
  const [defaultRange, setDefaultRange] = useState<QuickRangeKey>(() => {
    const saved = localStorage.getItem(DEFAULT_RANGE_KEY);
    return RANGE_CHOICES.includes(saved as QuickRangeKey) ? (saved as QuickRangeKey) : "last30d";
  });
  const [cleared, setCleared] = useState(false);

  const changeDefaultRange = (key: QuickRangeKey) => {
    setDefaultRange(key);
    localStorage.setItem(DEFAULT_RANGE_KEY, key);
    dispatch({ type: "setQuickRange", key });
  };

  const clearLocalConfig = () => {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t("settings.title")}</DialogTitle>
        <DialogDescription>{t("settings.description")}</DialogDescription>

        <div className="mt-4 space-y-4">
          <section>
            <Label>{t("settings.defaultRange")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {RANGE_CHOICES.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={defaultRange === key ? "secondary" : "ghost"}
                  onClick={() => changeDefaultRange(key)}
                >
                  {quickRangeLabel(key)}
                </Button>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <Label>{t("settings.scanStats")}</Label>
            {report ? (
              <dl className="tnum mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <dt>{t("settings.scannedFiles")}</dt>
                <dd className="text-right text-foreground">
                  {t("settings.files", { count: formatTokens(report.scannedFiles, false) })}
                </dd>
                <dt>{t("settings.parsedRecords")}</dt>
                <dd className="text-right text-foreground">
                  {t("settings.records", { count: formatTokens(report.parsedRecords, false) })}
                </dd>
                <dt>{t("settings.skippedRecords")}</dt>
                <dd className="text-right text-foreground">
                  {t("settings.records", {
                    count: formatTokens(report.malformedRecords + report.oversizedRecords, false),
                  })}
                </dd>
                <dt>{t("settings.generatedAt")}</dt>
                <dd className="text-right text-foreground">{formatDateTime(report.generatedAt)}</dd>
              </dl>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">{t("settings.noData")}</p>
            )}
          </section>

          <Separator />

          <section>
            <Label>{t("settings.pricingSource")}</Label>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t("settings.pricingDescription")}
            </p>
          </section>

          <Separator />

          <section className="flex items-center justify-between">
            <div>
              <Label>{t("settings.localConfig")}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("settings.localConfigDescription")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={clearLocalConfig}>
              <Trash2 size={13} />
              {cleared ? t("settings.cleared") : t("common.clear")}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

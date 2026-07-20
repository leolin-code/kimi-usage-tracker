import { AlertTriangle, OctagonAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { currentLocale } from "../../i18n.ts";
import { granularityLabel, resolveQuickRange, timezoneLabel } from "../../lib/report-utils.ts";
import { formatDateTime, formatTokens } from "../../report-model.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { Separator } from "../ui/separator.tsx";

function formatRangeBoundary(ms: number | null): string {
  if (ms === null) return "—";
  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

export function Footer() {
  const { t } = useTranslation();
  const { report, filter } = useDashboard();
  if (!report) return null;

  const range = resolveQuickRange(filter.quickRange, new Date(), {
    startMs: filter.customStartMs,
    endMs: filter.customEndMs,
  });
  const skipped = report.malformedRecords + report.oversizedRecords;

  return (
    <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 pb-6 text-xs text-muted-foreground">
      <span className="tnum">
        {t("footer.updated", { time: formatDateTime(report.generatedAt) })}
      </span>
      <Separator className="h-3" orientation="vertical" />
      <span className="tnum">
        {t("footer.range", {
          start: formatRangeBoundary(range.startMs),
          end: formatRangeBoundary(range.endMs),
        })}
      </span>
      <Separator className="h-3" orientation="vertical" />
      <span>{t("footer.granularity", { value: granularityLabel(report.granularity) })}</span>
      <Separator className="h-3" orientation="vertical" />
      <span>{timezoneLabel()}</span>
      <Separator className="h-3" orientation="vertical" />
      <span className="tnum">
        {t("footer.scan", {
          files: formatTokens(report.scannedFiles, false),
          records: formatTokens(report.parsedRecords, false),
        })}
      </span>
      {skipped > 0 ? (
        <span className="inline-flex items-center gap-1 text-amber">
          <AlertTriangle size={13} />
          {t("footer.skipped", { count: formatTokens(skipped, false) })}
        </span>
      ) : null}
      {report.limitsReached ? (
        <span className="inline-flex items-center gap-1 text-red">
          <OctagonAlert size={13} />
          {t("footer.limit")}
        </span>
      ) : null}
    </footer>
  );
}

import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDashboard } from "../../state/dashboard.tsx";
import { Button } from "../ui/button.tsx";

/** 筛选无结果的空态。 */
export function EmptyState() {
  const { t } = useTranslation();
  const { dispatch } = useDashboard();
  return (
    <section className="surface-card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX size={20} />
      </span>
      <h2 className="text-base font-semibold">{t("states.emptyTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("states.emptyDescription")}</p>
      <Button variant="outline" onClick={() => dispatch({ type: "reset" })}>
        {t("states.clearFilters")}
      </Button>
    </section>
  );
}

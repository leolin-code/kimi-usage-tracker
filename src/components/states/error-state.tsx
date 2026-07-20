import { FolderOpen, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { pickHomeDirectory } from "../../lib/api.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import { Button } from "../ui/button.tsx";

/** 加载失败（含目录无效）的错误卡：重试 + 选择目录。 */
export function ErrorState() {
  const { t } = useTranslation();
  const { error, refresh, changeHome } = useDashboard();

  const selectHome = async () => {
    const selected = await pickHomeDirectory();
    if (selected) changeHome(selected);
  };

  return (
    <section
      className="surface-card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 px-6 py-10 text-center"
      role="alert"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red/10 text-red">
        <TriangleAlert size={20} />
      </span>
      <h2 className="text-base font-semibold">{t("states.readError")}</h2>
      <p className="text-sm break-all text-muted-foreground">{error}</p>
      <div className="mt-1 flex gap-2">
        <Button variant="outline" onClick={refresh}>
          <RefreshCw size={14} />
          {t("states.retry")}
        </Button>
        <Button onClick={selectHome}>
          <FolderOpen size={14} />
          {t("states.chooseDirectory")}
        </Button>
      </div>
    </section>
  );
}

import { Skeleton } from "../ui/skeleton.tsx";
import { useTranslation } from "react-i18next";

/** 首屏骨架屏：筛选条 + 指标卡 + 图表占位（与正式布局同尺寸，避免跳动）。 */
export function DashboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" aria-label={t("states.loading")} className="space-y-2.5">
      <div className="surface-card flex items-center gap-2 px-4 py-3">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="ml-auto h-7 w-40" />
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="surface-card px-3 py-2.5" key={index}>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="mt-1.5 h-8 w-20" />
            <Skeleton className="mt-1 h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="surface-card col-span-2 px-4 py-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-52 w-full" />
        </div>
        <div className="surface-card px-4 py-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-52 w-full" />
        </div>
      </div>
    </div>
  );
}

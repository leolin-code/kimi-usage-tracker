import { CompositionChart } from "./components/charts/composition-chart.tsx";
import { TrendChart } from "./components/charts/trend-chart.tsx";
import { FilterBadges } from "./components/filters/filter-badges.tsx";
import { FilterBar } from "./components/filters/filter-bar.tsx";
import { Footer } from "./components/layout/footer.tsx";
import { Topbar } from "./components/layout/topbar.tsx";
import { MetricsGrid } from "./components/metrics/metrics-grid.tsx";
import { DashboardSkeleton } from "./components/states/dashboard-skeleton.tsx";
import { EmptyState } from "./components/states/empty-state.tsx";
import { ErrorBoundary } from "./components/states/error-boundary.tsx";
import { ErrorState } from "./components/states/error-state.tsx";
import { ModelTable } from "./components/tables/model-table.tsx";
import { RecentTable } from "./components/tables/recent-table.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { ThemeProvider } from "./hooks/use-theme.tsx";
import { cn } from "./lib/utils.ts";
import { DashboardProvider, useDashboard } from "./state/dashboard.tsx";
import { useTranslation } from "react-i18next";

function DashboardContent() {
  const { t } = useTranslation();
  const { report, initialLoading, refreshing, error } = useDashboard();

  if (initialLoading && !report) {
    return (
      <main className="px-3 py-3">
        <DashboardSkeleton />
      </main>
    );
  }

  if (error && !report) {
    return (
      <main className="px-3 py-3">
        <ErrorState />
      </main>
    );
  }

  const empty = report !== null && report.requests === 0;

  return (
    <main className="space-y-2.5 px-3 py-3">
      <FilterBar />
      <FilterBadges />
      {empty ? (
        <EmptyState />
      ) : (
        <div className={cn("space-y-2.5 transition-opacity", refreshing ? "opacity-85" : "")}>
          <ErrorBoundary name={t("states.metricCards")}>
            <MetricsGrid />
          </ErrorBoundary>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2 min-w-0">
              <ErrorBoundary name={t("states.trendChart")}>
                <TrendChart />
              </ErrorBoundary>
            </div>
            <div className="min-w-0">
              <ErrorBoundary name={t("states.compositionChart")}>
                <CompositionChart />
              </ErrorBoundary>
            </div>
          </div>
          <ErrorBoundary name={t("states.modelTable")}>
            <ModelTable />
          </ErrorBoundary>
          <ErrorBoundary name={t("states.recentTable")}>
            <RecentTable />
          </ErrorBoundary>
          <Footer />
        </div>
      )}
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <DashboardProvider>
          <div className="min-h-full">
            <Topbar />
            <DashboardContent />
          </div>
        </DashboardProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { currentLocale } from "../../i18n.ts";
import { cn } from "../../lib/utils.ts";
import { formatCny, formatTokens, shortModelName } from "../../report-model.ts";
import { useDashboard } from "../../state/dashboard.tsx";
import type { RecentUsage } from "../../types.ts";
import { Button } from "../ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";
import { Input } from "../ui/input.tsx";

const helper = createColumnHelper<RecentUsage>();

const formatFullTime = (value: number) =>
  new Intl.DateTimeFormat(currentLocale(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);

const PAGE_SIZES = [20, 50, 100] as const;

export function RecentTable() {
  const { t, i18n } = useTranslation();
  const { report } = useDashboard();
  const recent = useMemo(() => report?.recent ?? [], [report]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });

  const columns = useMemo(
    () => [
      helper.accessor("time", {
        header: t("tables.time"),
        size: 130,
        cell: (info) => (
          <span className="tnum text-muted-foreground">{formatFullTime(info.getValue())}</span>
        ),
      }),
      helper.accessor("model", {
        header: t("tables.model"),
        size: 150,
        cell: (info) => (
          <span className="block truncate" title={info.getValue()}>
            {shortModelName(info.getValue())}
          </span>
        ),
      }),
      helper.accessor("sessionId", {
        header: t("tables.session"),
        size: 140,
        cell: (info) => (
          <span className="tnum block truncate text-muted-foreground" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      helper.accessor("agent", {
        header: t("tables.agent"),
        size: 90,
        cell: (info) => info.getValue(),
      }),
      helper.accessor("scope", {
        header: t("tables.scope"),
        size: 90,
        cell: (info) => info.getValue(),
      }),
      helper.accessor((row) => row.tokens.inputOther, {
        id: "input",
        header: t("tables.input"),
        size: 80,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue())}</span>,
      }),
      helper.accessor((row) => row.tokens.inputCacheRead, {
        id: "cacheRead",
        header: t("tables.cacheRead"),
        size: 80,
        cell: (info) => <span className="tnum text-green">{formatTokens(info.getValue())}</span>,
      }),
      helper.accessor((row) => row.tokens.inputCacheCreation, {
        id: "cacheWrite",
        header: t("tables.cacheCreation"),
        size: 80,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue())}</span>,
      }),
      helper.accessor((row) => row.tokens.output, {
        id: "output",
        header: t("tables.output"),
        size: 80,
        cell: (info) => <span className="tnum text-orange">{formatTokens(info.getValue())}</span>,
      }),
      helper.accessor((row) => row.tokens.total, {
        id: "total",
        header: t("tables.total"),
        size: 90,
        cell: (info) => <span className="tnum font-medium">{formatTokens(info.getValue())}</span>,
      }),
      helper.accessor((row) => row.costCny, {
        id: "cost",
        header: t("tables.cost"),
        size: 100,
        cell: (info) =>
          info.getValue() === null ? (
            <span className="text-muted-foreground">{t("common.unpriced")}</span>
          ) : (
            <span className="tnum text-teal">{formatCny(info.getValue(), 6)}</span>
          ),
      }),
    ],
    [t, i18n.resolvedLanguage],
  );

  const table = useReactTable({
    data: recent as RecentUsage[],
    columns,
    state: { globalFilter, pagination },
    onGlobalFilterChange: (value) => {
      setGlobalFilter(value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const { rows } = table.getRowModel();
  const useVirtual = rows.length > 50;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });
  const virtualRows = useVirtual ? virtualizer.getVirtualItems() : [];
  const renderedRows = useVirtual
    ? virtualRows.map((item) => ({ row: rows[item.index], item }))
    : rows.map((row) => ({ row, item: null }));

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <Card>
      <CardHeader className="flex-wrap gap-y-2">
        <CardTitle>
          {t("tables.recent")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("tables.recordCount", { count: filteredCount })}
          </span>
        </CardTitle>
        <div className="relative">
          <Search
            className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
            size={13}
          />
          <Input
            aria-label={t("tables.searchRecent")}
            className="h-7 w-52 pl-7 text-xs"
            placeholder={t("tables.searchRecentPlaceholder")}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("tables.noRecent")}</p>
        ) : (
          <>
            <div className={cn("overflow-auto", useVirtual ? "max-h-[460px]" : "")} ref={scrollRef}>
              <table
                className="w-full border-collapse text-[13px]"
                style={{ width: table.getTotalSize(), tableLayout: "fixed" }}
              >
                <thead className="sticky top-0 z-10 bg-card">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          className="border-b border-border px-2 py-2 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
                          key={header.id}
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody
                  style={
                    useVirtual
                      ? { height: virtualizer.getTotalSize(), position: "relative" }
                      : undefined
                  }
                >
                  {renderedRows.map(({ row, item }) => (
                    <tr
                      className="border-b border-border/60 hover:bg-muted/50"
                      data-index={item?.index}
                      key={row.id}
                      ref={useVirtual ? virtualizer.measureElement : undefined}
                      style={
                        item
                          ? {
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${item.start}px)`,
                              display: "flex",
                            }
                          : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          className="px-2 py-1.5 align-middle"
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tnum">
                {t("tables.page", {
                  current: table.getState().pagination.pageIndex + 1,
                  total: Math.max(1, table.getPageCount()),
                  count: filteredCount,
                  unit: t("tables.recordUnit"),
                })}
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label={t("tables.rowsPerPage")}
                  className="h-7 cursor-pointer rounded-[var(--radius-control)] border-0 bg-muted/70 px-1.5 text-xs"
                  value={pagination.pageSize}
                  onChange={(event) => table.setPageSize(Number(event.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {t("tables.rows", { count: size })}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!table.getCanPreviousPage()}
                  size="sm"
                  variant="ghost"
                  onClick={() => table.previousPage()}
                >
                  {t("tables.previous")}
                </Button>
                <Button
                  disabled={!table.getCanNextPage()}
                  size="sm"
                  variant="ghost"
                  onClick={() => table.nextPage()}
                >
                  {t("tables.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

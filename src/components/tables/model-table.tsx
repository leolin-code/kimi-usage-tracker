import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  Settings2,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { exportModels } from "../../lib/export.ts";
import { cn } from "../../lib/utils.ts";
import { formatCny, formatPercent, formatTokens, shortModelName } from "../../report-model.ts";
import { useDashboard, type TokenFocusKey } from "../../state/dashboard.tsx";
import type { ModelUsage } from "../../types.ts";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Input } from "../ui/input.tsx";

const STORAGE_KEY = "kimi-usage-model-table-v1";

type PersistedTableConfig = {
  visibility?: VisibilityState;
  sizing?: ColumnSizingState;
  pageSize?: number;
};

function readConfig(): PersistedTableConfig {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const helper = createColumnHelper<ModelUsage>();

const FOCUS_COLUMN: Record<TokenFocusKey, string> = {
  input: "inputOther",
  cache: "cacheRead",
  "cache-write": "cacheCreation",
  output: "output",
};

const PAGE_SIZES = [20, 50, 100] as const;

export function ModelTable() {
  const { t, i18n } = useTranslation();
  const { report, tokenFocus } = useDashboard();
  const models = useMemo(() => report?.models ?? [], [report]);

  const persisted = useMemo(readConfig, []);
  const [sorting, setSorting] = useState<SortingState>([{ id: "requests", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    persisted.visibility ?? {},
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(persisted.sizing ?? {});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: persisted.pageSize ?? 20,
  });

  const columns = useMemo(
    () => [
      helper.accessor("model", {
        id: "model",
        header: t("tables.model"),
        size: 240,
        cell: (info) => {
          const row = info.row;
          return (
            <div className="flex items-center gap-1.5">
              <button
                aria-label={row.getIsExpanded() ? t("tables.collapse") : t("tables.expand")}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                type="button"
                onClick={row.getToggleExpandedHandler()}
              >
                {row.getIsExpanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div className="min-w-0">
                <div className="truncate font-medium" title={info.getValue()}>
                  {shortModelName(info.getValue())}
                </div>
                <div className="flex items-center gap-1">
                  {row.original.pricing ? (
                    <Badge variant="teal">{t("tables.priced")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("common.unpriced")}</Badge>
                  )}
                  {row.original.aliases.length > 0 ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {row.original.aliases.join("、")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        },
      }),
      helper.accessor("requests", {
        header: t("tables.requests"),
        size: 90,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue(), false)}</span>,
      }),
      helper.accessor((row) => row.tokens.inputOther, {
        id: "inputOther",
        header: t("metrics.input"),
        size: 100,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue(), false)}</span>,
      }),
      helper.accessor((row) => row.tokens.inputCacheRead, {
        id: "cacheRead",
        header: t("metrics.cacheRead"),
        size: 100,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue(), false)}</span>,
      }),
      helper.accessor((row) => row.tokens.inputCacheCreation, {
        id: "cacheCreation",
        header: t("metrics.cacheCreation"),
        size: 100,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue(), false)}</span>,
      }),
      helper.accessor((row) => row.tokens.output, {
        id: "output",
        header: t("metrics.output"),
        size: 100,
        cell: (info) => <span className="tnum">{formatTokens(info.getValue(), false)}</span>,
      }),
      helper.accessor("cacheHitRate", {
        id: "hitRate",
        header: t("tables.hitRate"),
        size: 90,
        cell: (info) => <span className="tnum">{formatPercent(info.getValue())}</span>,
      }),
      helper.accessor((row) => (row.costCny === null ? -1 : Number.parseFloat(row.costCny)), {
        id: "cost",
        header: t("tables.cost"),
        size: 110,
        cell: (info) =>
          info.row.original.costCny === null ? (
            <span className="text-muted-foreground">{t("common.unpriced")}</span>
          ) : (
            <span className="tnum text-teal">{formatCny(info.row.original.costCny)}</span>
          ),
      }),
    ],
    [t, i18n.resolvedLanguage],
  );

  const table = useReactTable({
    data: models as ModelUsage[],
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      columnSizing,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: (value) => {
      setGlobalFilter(value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persist({ visibility: next });
        return next;
      });
    },
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persist({ sizing: next });
        return next;
      });
    },
    onPaginationChange: (updater) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        persist({ pageSize: next.pageSize });
        return next;
      });
    },
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    autoResetPageIndex: false,
  });

  function persist(patch: Partial<PersistedTableConfig>) {
    const next = { ...readConfig(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const { rows } = table.getRowModel();
  const useVirtual = rows.length > 50;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });
  const virtualRows = useVirtual ? virtualizer.getVirtualItems() : [];
  const renderedRows = useVirtual
    ? virtualRows.map((item) => ({ row: rows[item.index], item }))
    : rows.map((row) => ({ row, item: null }));

  const focusColumn = tokenFocus ? FOCUS_COLUMN[tokenFocus] : null;
  const filteredCount = table.getFilteredRowModel().rows.length;

  const doExport = (format: "csv" | "json") => {
    const exported = table.getSortedRowModel().rows.map((row) => row.original);
    void exportModels(exported, format);
  };

  return (
    <Card>
      <CardHeader className="flex-wrap gap-y-2">
        <CardTitle>
          {t("tables.modelStats")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("tables.modelCount", { count: filteredCount })}
          </span>
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search
              className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
              size={13}
            />
            <Input
              aria-label={t("tables.searchModel")}
              className="h-7 w-44 pl-7 text-xs"
              placeholder={t("tables.searchModelPlaceholder")}
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={t("tables.columns")} size="icon-sm" variant="outline">
                <Settings2 size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("tables.columns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((column) => column.id !== "model")
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {typeof column.columnDef.header === "string"
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Download size={13} />
                {t("tables.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("csv")}>
                {t("tables.exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("json")}>
                {t("tables.exportJson")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("tables.noModels")}</p>
        ) : (
          <>
            <div className={cn("overflow-auto", useVirtual ? "max-h-[480px]" : "")} ref={scrollRef}>
              <table
                className="w-full border-collapse text-[13px]"
                style={{ width: table.getTotalSize(), tableLayout: "fixed" }}
              >
                <thead className="sticky top-0 z-10 bg-card">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          className={cn(
                            "relative border-b border-border px-2 py-2 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase",
                            header.column.id === "model" ? "sticky left-0 z-10 bg-card" : "",
                          )}
                          key={header.id}
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder ? null : (
                            <button
                              className="flex cursor-pointer items-center gap-1 hover:text-foreground"
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getIsSorted() === "asc" ? (
                                <ArrowUp size={12} />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ArrowDown size={12} />
                              ) : (
                                <ArrowUpDown className="opacity-40" size={12} />
                              )}
                            </button>
                          )}
                          {header.column.getCanResize() ? (
                            <div
                              aria-hidden
                              className={cn(
                                "absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/40",
                                header.column.getIsResizing() ? "bg-primary/60" : "",
                              )}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                            />
                          ) : null}
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
                    <Fragment key={row.id}>
                      <tr
                        className="border-b border-border/60 hover:bg-muted/50"
                        data-index={item?.index}
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
                            className={cn(
                              "px-2 py-2 align-middle",
                              cell.column.id === "model" ? "sticky left-0 bg-card" : "",
                              focusColumn === cell.column.id ? "bg-primary/8" : "",
                            )}
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {row.getIsExpanded() ? (
                        <tr className="border-b border-border/60 bg-muted/30">
                          <td
                            className="px-4 py-3 text-xs text-muted-foreground"
                            colSpan={row.getVisibleCells().length}
                          >
                            <ModelDetail model={row.original} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
                  unit: t("tables.rowUnit"),
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

function ModelDetail({ model }: Readonly<{ model: ModelUsage }>) {
  const { t } = useTranslation();
  const pricing = model.pricing;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <div className="font-medium text-foreground">{t("tables.modelId")}</div>
        <div className="tnum mt-0.5 break-all">{model.model}</div>
        {model.aliases.length > 0 ? (
          <div className="mt-1">{t("tables.aliases", { value: model.aliases.join(", ") })}</div>
        ) : null}
      </div>
      {pricing ? (
        <div>
          <div className="font-medium text-foreground">{t("tables.pricingDetails")}</div>
          <dl className="tnum mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
            <dt>{t("tables.input")}</dt>
            <dd>¥{pricing.inputCnyPerMillion}/M</dd>
            <dt>{t("tables.output")}</dt>
            <dd>¥{pricing.outputCnyPerMillion}/M</dd>
            <dt>{t("metrics.cacheRead")}</dt>
            <dd>¥{pricing.cacheReadCnyPerMillion}/M</dd>
            <dt>{t("tables.contextWindow")}</dt>
            <dd>{formatTokens(pricing.contextTokens, false)}</dd>
            <dt>{t("tables.verifiedAt")}</dt>
            <dd>{pricing.verifiedOn}</dd>
          </dl>
          <a
            className="mt-1 inline-block text-primary underline-offset-2 hover:underline"
            href={pricing.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("tables.pricingSource")}
          </a>
        </div>
      ) : (
        <div>
          <div className="font-medium text-foreground">{t("tables.pricingDetails")}</div>
          <div className="mt-0.5">{t("tables.unpricedDescription")}</div>
        </div>
      )}
    </div>
  );
}

import { exportTextFile } from "./api.ts";
import { buildCsv } from "./report-utils.ts";
import i18n from "../i18n.ts";
import type { ModelUsage } from "../types.ts";

const stamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const modelHeaders = () =>
  [
    i18n.t("export.model"),
    i18n.t("export.aliases"),
    i18n.t("export.requests"),
    i18n.t("export.input"),
    i18n.t("export.cacheRead"),
    i18n.t("export.cacheCreation"),
    i18n.t("export.output"),
    i18n.t("export.total"),
    i18n.t("export.hitRate"),
    i18n.t("export.cost"),
  ] as const;

function modelRow(model: ModelUsage): string[] {
  return [
    model.model,
    model.aliases.join(" "),
    String(model.requests),
    String(model.tokens.inputOther),
    String(model.tokens.inputCacheRead),
    String(model.tokens.inputCacheCreation),
    String(model.tokens.output),
    String(model.tokens.total),
    (model.cacheHitRate * 100).toFixed(2) + "%",
    model.costCny ?? i18n.t("common.unpriced"),
  ];
}

/** 导出模型统计（当前筛选 + 排序后的行）。 */
export async function exportModels(
  rows: readonly ModelUsage[],
  format: "csv" | "json",
): Promise<"saved" | "cancelled"> {
  if (format === "csv") {
    const csv = buildCsv(modelHeaders(), rows.map(modelRow));
    return exportTextFile(`kimi-usage-models-${stamp()}.csv`, csv, [
      { name: "CSV", extensions: ["csv"] },
    ]);
  }
  const json = JSON.stringify(rows, null, 2);
  return exportTextFile(`kimi-usage-models-${stamp()}.json`, json, [
    { name: "JSON", extensions: ["json"] },
  ]);
}

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { generateMockReport } from "../dev-mock.ts";
import i18n from "../i18n.ts";
import type { ScanFilter, UsageReport } from "../types.ts";

/** 是否运行在 Tauri 桌面环境（纯 vite dev 浏览器预览时为 false）。 */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function defaultKimiHome(): Promise<string> {
  if (isTauri) return invoke<string>("default_kimi_home");
  return i18n.t("dev.mockDirectory");
}

export async function scanUsage(home: string, filter: ScanFilter | null): Promise<UsageReport> {
  if (isTauri) {
    return invoke<UsageReport>("scan_usage", { home, filter });
  }
  // 模拟一点网络/扫描延迟，便于观察加载态
  await new Promise((resolve) => setTimeout(resolve, 250));
  return generateMockReport(home, filter);
}

/** 选择数据目录；浏览器环境返回 null。 */
export async function pickHomeDirectory(): Promise<string | null> {
  if (!isTauri) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: i18n.t("dialog.chooseDirectory"),
  });
  return typeof selected === "string" ? selected : null;
}

/**
 * 导出文本文件：Tauri 环境走 save() 对话框 + export_text 命令；
 * 浏览器 dev 环境降级为 Blob 下载。
 */
export async function exportTextFile(
  defaultFileName: string,
  contents: string,
  filters: { name: string; extensions: string[] }[],
): Promise<"saved" | "cancelled"> {
  if (isTauri) {
    const path = await save({ defaultPath: defaultFileName, filters });
    if (!path) return "cancelled";
    await invoke("export_text", { path, contents });
    return "saved";
  }
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = defaultFileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return "saved";
}

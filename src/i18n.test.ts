import { afterAll, describe, expect, it } from "vitest";

import i18n, { currentLocale, supportedLanguages } from "./i18n.ts";
import { granularityLabel, quickRangeLabel } from "./lib/report-utils.ts";
import { formatCny, tokenSegments } from "./report-model.ts";

afterAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("i18n", () => {
  it("声明中英文并以中文回退", () => {
    expect(supportedLanguages).toEqual(["zh-CN", "en-US"]);
    expect(i18n.options.fallbackLng).toEqual(["zh-CN"]);
  });

  it("切换语言后翻译快捷范围、粒度和 Token 构成", async () => {
    await i18n.changeLanguage("en-US");
    expect(currentLocale()).toBe("en-US");
    expect(quickRangeLabel("last30d")).toBe("Last 30 days");
    expect(granularityLabel("hour")).toBe("Hour");
    expect(
      tokenSegments({
        inputOther: 1,
        inputCacheRead: 2,
        inputCacheCreation: 3,
        output: 4,
        total: 10,
      }).map((segment) => segment.label),
    ).toEqual(["Uncached input", "Cache read", "Cache creation", "Output"]);
    expect(formatCny(null)).toBe("Unpriced");

    await i18n.changeLanguage("zh-CN");
    expect(currentLocale()).toBe("zh-CN");
    expect(quickRangeLabel("last30d")).toBe("近 30 天");
    expect(granularityLabel("hour")).toBe("小时");
    expect(formatCny(null)).toBe("未定价");
  });

  it("不支持的语言回退到中文", async () => {
    await i18n.changeLanguage("fr-FR");
    expect(currentLocale()).toBe("zh-CN");
    expect(i18n.t("settings.title")).toBe("设置");
  });
});

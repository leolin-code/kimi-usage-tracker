import { beforeAll, describe, expect, it } from "vitest";

import i18n from "./i18n.ts";
import { formatCny, formatDuration, formatPercent, tokenSegments } from "./report-model.ts";

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("report model", () => {
  it("keeps token composition cache-normalized", () => {
    const segments = tokenSegments({
      inputOther: 100,
      output: 20,
      inputCacheRead: 80,
      inputCacheCreation: 0,
      total: 200,
    });
    expect(segments.map((segment) => segment.ratio)).toEqual([0.5, 0.4, 0, 0.1]);
  });

  it("formats bounded percentages and unpriced models", () => {
    expect(formatPercent(1.5)).toBe("100.0%");
    expect(formatPercent(Number.NaN)).toBe("0.00%");
    expect(formatCny(null)).toBe("未定价");
    expect(formatCny("0.000004", 6)).toBe("¥0.000004");
  });

  it("formats request durations for scanning", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(12_340)).toBe("12 s");
    expect(formatDuration(138_000)).toBe("2m 18s");
    expect(formatDuration(3_780_000)).toBe("1h 3m");
  });
});

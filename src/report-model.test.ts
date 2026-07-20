import { describe, expect, it } from "vitest";

import { formatCny, formatPercent, tokenSegments } from "./report-model.ts";

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
});

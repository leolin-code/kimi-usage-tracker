import { describe, expect, it } from "vitest";

import { generateMockReport } from "./dev-mock.ts";

const HOME = "/tmp/mock-home";
const DAY = 24 * 60 * 60 * 1000;

describe("dev-mock 合成报表", () => {
  it("无筛选时返回完整结构", () => {
    const report = generateMockReport(HOME, null);
    expect(report.requests).toBeGreaterThan(0);
    expect(report.series.length).toBeGreaterThan(0);
    expect(report.models.length).toBeGreaterThan(0);
    expect(report.recent.length).toBeGreaterThan(0);
    expect(report.recent.length).toBeLessThanOrEqual(1000);
    expect(report.dimensions.models.length).toBe(report.models.length);
    expect(report.comparison).toBeNull(); // 全部时间无对比周期
    // Token 总量自洽
    const sum =
      report.tokens.inputOther +
      report.tokens.inputCacheRead +
      report.tokens.inputCacheCreation +
      report.tokens.output;
    expect(report.tokens.total).toBe(sum);
  });

  it("确定性：同样输入产出同样结果", () => {
    const filter = { startMs: Date.now() - 7 * DAY, endMs: Date.now() };
    const a = generateMockReport(HOME, filter);
    const b = generateMockReport(HOME, filter);
    expect(a.requests).toBe(b.requests);
    expect(a.tokens.total).toBe(b.tokens.total);
  });

  it("时间范围过滤生效且产出对比周期", () => {
    const now = Date.now();
    const report = generateMockReport(HOME, {
      startMs: now - 7 * DAY,
      endMs: now,
    });
    expect(report.comparison).not.toBeNull();
    for (const bucket of report.series) {
      expect(bucket.startMs).toBeGreaterThanOrEqual(now - 7 * DAY - DAY);
      expect(bucket.startMs).toBeLessThanOrEqual(now + DAY);
    }
  });

  it("billing=priced 时不含未定价模型", () => {
    const report = generateMockReport(HOME, { billing: "priced" });
    expect(report.models.every((model) => model.pricing !== null)).toBe(true);
    expect(report.unpricedRequests).toBe(0);
  });

  it("billing=unpriced 时费用为零", () => {
    const report = generateMockReport(HOME, { billing: "unpriced" });
    expect(report.models.every((model) => model.pricing === null)).toBe(true);
    expect(Number.parseFloat(report.pricedCostCny)).toBe(0);
  });

  it("模型筛选生效", () => {
    const all = generateMockReport(HOME, null);
    const picked = all.models[0].model;
    const filtered = generateMockReport(HOME, { models: [picked] });
    expect(filtered.models.map((model) => model.model)).toEqual([picked]);
    expect(filtered.requests).toBeLessThan(all.requests);
  });
});

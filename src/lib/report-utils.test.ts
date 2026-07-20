import { beforeAll, describe, expect, it } from "vitest";

import i18n from "../i18n.ts";
import {
  activeFilterCount,
  buildCsv,
  buildScanFilter,
  computeDelta,
  csvEscape,
  DEFAULT_FILTER_STATE,
  formatAxisLabel,
  formatDeltaRatio,
  granularityLabel,
  resolveMultiParam,
  resolveQuickRange,
  timezoneLabel,
} from "./report-utils.ts";

const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("resolveQuickRange", () => {
  // 2026-07-20 12:40 本地时间
  const now = at("2026-07-20T12:40:00");

  it("今天：本地 0 点到 now", () => {
    const range = resolveQuickRange("today", now);
    const start = new Date(range.startMs!);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(20);
    expect(range.endMs).toBe(now.getTime());
  });

  it("昨天：前一整天闭区间", () => {
    const range = resolveQuickRange("yesterday", now);
    const start = new Date(range.startMs!);
    const end = new Date(range.endMs!);
    expect(start.getDate()).toBe(19);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(19);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("近 24 小时 / 近 7 天 / 近 30 天", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(resolveQuickRange("last24h", now).startMs).toBe(now.getTime() - day);
    expect(resolveQuickRange("last7d", now).startMs).toBe(now.getTime() - 7 * day);
    expect(resolveQuickRange("last30d", now).startMs).toBe(now.getTime() - 30 * day);
  });

  it("本月与上月（跨月边界）", () => {
    const thisMonth = resolveQuickRange("thisMonth", now);
    expect(new Date(thisMonth.startMs!).getDate()).toBe(1);
    expect(new Date(thisMonth.startMs!).getMonth()).toBe(6);

    const lastMonth = resolveQuickRange("lastMonth", now);
    expect(new Date(lastMonth.startMs!).getMonth()).toBe(5);
    expect(new Date(lastMonth.startMs!).getDate()).toBe(1);
    const end = new Date(lastMonth.endMs!);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30); // 6 月最后一天的 23:59:59.999
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("上月跨年：1 月时取上一年 12 月", () => {
    const jan = at("2026-01-15T08:00:00");
    const range = resolveQuickRange("lastMonth", jan);
    expect(new Date(range.startMs!).getFullYear()).toBe(2025);
    expect(new Date(range.startMs!).getMonth()).toBe(11);
    const end = new Date(range.endMs!);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it("昨天跨月：7 月 1 日时取 6 月 30 日", () => {
    const first = at("2026-07-01T06:00:00");
    const range = resolveQuickRange("yesterday", first);
    expect(new Date(range.startMs!).getMonth()).toBe(5);
    expect(new Date(range.startMs!).getDate()).toBe(30);
  });

  it("全部：双侧均为 null", () => {
    expect(resolveQuickRange("all", now)).toEqual({
      startMs: null,
      endMs: null,
    });
  });

  it("自定义范围透传", () => {
    const custom = { startMs: 1000, endMs: 2000 };
    expect(resolveQuickRange("custom", now, custom)).toEqual(custom);
  });
});

describe("computeDelta", () => {
  it("正常升降平", () => {
    expect(computeDelta(150, 100)).toEqual({ ratio: 0.5, direction: "up" });
    expect(computeDelta(50, 100)).toEqual({ ratio: -0.5, direction: "down" });
    expect(computeDelta(100, 100).direction).toBe("flat");
  });

  it("上一周期缺失或为 0", () => {
    expect(computeDelta(100, null).ratio).toBeNull();
    expect(computeDelta(100, undefined).ratio).toBeNull();
    expect(computeDelta(100, 0)).toEqual({ ratio: null, direction: "up" });
    expect(computeDelta(0, 0)).toEqual({ ratio: null, direction: "flat" });
  });

  it("格式化比率", () => {
    expect(formatDeltaRatio(0.5)).toBe("+50.0%");
    expect(formatDeltaRatio(-0.256)).toBe("-25.6%");
    expect(formatDeltaRatio(null)).toBe("—");
    expect(formatDeltaRatio(2.5)).toBe("+250%");
  });
});

describe("csv", () => {
  it("转义逗号、引号、换行", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("构建带 BOM 与表头的 CSV", () => {
    const csv = buildCsv(
      ["名称", "值"],
      [
        ["a,b", "1"],
        ['x"y', "2"],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toEqual(["名称,值", '"a,b",1', '"x""y",2']);
  });
});

describe("轴标签与粒度", () => {
  const sample = at("2026-07-20T09:05:00").getTime();

  it("按粒度格式化", () => {
    expect(formatAxisLabel(sample, "minute")).toBe("09:05");
    expect(formatAxisLabel(sample, "hour")).toBe("07-20 09:00");
    expect(formatAxisLabel(sample, "day")).toBe("07-20");
    expect(formatAxisLabel(sample, "week")).toBe("07-20");
    expect(formatAxisLabel(sample, "month")).toBe("2026-07");
  });

  it("粒度展示名", () => {
    expect(granularityLabel("auto")).toBe("auto");
    expect(granularityLabel("minute")).toBe("分钟");
    expect(granularityLabel("month")).toBe("月");
  });
});

describe("时区展示", () => {
  it("包含 IANA 名称与 GMT 偏移", () => {
    expect(timezoneLabel()).toMatch(/\(GMT[+-]\d+(:\d{2})?\)/);
  });
});

describe("多选参数折叠", () => {
  const all = ["a", "b", "c"];

  it("include 模式", () => {
    expect(resolveMultiParam({ selected: [], mode: "include" }, all)).toBeUndefined();
    expect(resolveMultiParam({ selected: ["a"], mode: "include" }, all)).toEqual(["a"]);
  });

  it("exclude 模式为全集减选中", () => {
    expect(resolveMultiParam({ selected: ["a"], mode: "exclude" }, all)).toEqual(["b", "c"]);
    expect(resolveMultiParam({ selected: [], mode: "exclude" }, all)).toBeUndefined();
  });
});

describe("buildScanFilter", () => {
  it("默认状态给出近 30 天 + all/auto", () => {
    const now = at("2026-07-20T12:40:00");
    const filter = buildScanFilter(DEFAULT_FILTER_STATE, null, now);
    expect(filter.endMs).toBe(now.getTime());
    expect(filter.startMs).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(filter.billing).toBe("all");
    expect(filter.granularity).toBe("auto");
    expect(filter.models).toBeUndefined();
  });

  it("exclude 模式基于 dimensions 全集", () => {
    const filter = buildScanFilter(
      {
        ...DEFAULT_FILTER_STATE,
        models: { selected: ["kimi-k2"], mode: "exclude" },
      },
      {
        models: [
          { value: "kimi-k2", requests: 1 },
          { value: "kimi-k1", requests: 1 },
        ],
        sessions: [],
        agents: [],
        scopes: [],
      },
    );
    expect(filter.models).toEqual(["kimi-k1"]);
  });

  it("生效条件计数", () => {
    expect(activeFilterCount(DEFAULT_FILTER_STATE)).toBe(0);
    expect(
      activeFilterCount({
        ...DEFAULT_FILTER_STATE,
        quickRange: "today",
        billing: "priced",
        models: { selected: ["m1"], mode: "include" },
      }),
    ).toBe(3);
  });
});

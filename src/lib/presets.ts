import type { FilterState } from "./report-utils.ts";

const PRESETS_KEY = "kimi-usage-presets-v1";

export type FilterPreset = Readonly<{
  name: string;
  savedAt: number;
  state: FilterState;
}>;

export function readPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FilterPreset =>
        typeof item?.name === "string" && typeof item?.state === "object",
    );
  } catch {
    return [];
  }
}

export function savePreset(name: string, state: FilterState): FilterPreset[] {
  const trimmed = name.trim();
  if (!trimmed) return readPresets();
  const presets = readPresets().filter((preset) => preset.name !== trimmed);
  presets.push({ name: trimmed, savedAt: Date.now(), state });
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

export function deletePreset(name: string): FilterPreset[] {
  const presets = readPresets().filter((preset) => preset.name !== name);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

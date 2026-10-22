/** 视角只解析工作区的语义显示规则，不依赖任何具体领域或内置预设。 */
import type { Concept, DisplayMode, PerspectivePreset, PerspectiveSettings } from "./concepts";
import type { ConceptIndex } from "./conceptIndex";

export const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: "main", label: "主轴" }, { value: "dim", label: "淡显" },
  { value: "related", label: "收进相关" }, { value: "hidden", label: "隐藏" },
];
export function perspectivePreset(settings: PerspectiveSettings): PerspectivePreset {
  const preset = settings.presets.find(p => p.id === settings.presetId);
  if (!preset) throw new Error("视角预设不存在");
  return preset;
}

/** 多继承以最近分类为准；等距按 UUID 稳定排序，不依赖数据插入顺序。 */
export function displayMode(index: ConceptIndex, concept: Concept, scope: "relations" | "concepts", settings: PerspectiveSettings): DisplayMode {
  const preset = perspectivePreset(settings);
  const rules = { ...preset[scope], ...settings.overrides[settings.presetId]?.[scope] };
  const queue = [...concept.types].sort().map(id => ({ id, distance: 0 }));
  const seen = new Set<string>();
  let best: { id: string; distance: number; mode: DisplayMode } | undefined;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const mode = rules[current.id];
    if (mode && (!best || current.distance < best.distance || (current.distance === best.distance && current.id < best.id)))
      best = { ...current, mode };
    for (const parent of index.get(current.id).broader ?? []) queue.push({ id: parent, distance: current.distance + 1 });
  }
  if (!best) throw new Error(`视角没有覆盖“${concept.label}”的分类`);
  return best.mode;
}

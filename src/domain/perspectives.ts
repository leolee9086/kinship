/** 视角是语义显示过滤，不参与颜色、文字或几何规则。 */
import { C, P, type Concept, type DisplayMode, type PerspectivePreset, type PerspectiveSettings } from "./concepts";
import type { ConceptIndex } from "./conceptIndex";

export const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: "main", label: "主轴" }, { value: "dim", label: "淡显" },
  { value: "related", label: "收进相关" }, { value: "hidden", label: "隐藏" },
];
export const PERSPECTIVES: PerspectivePreset[] = [
  { id: P.genealogy, label: "族谱", description: "沿亲族关系阅读人物，其余关系收进相关。",
    relations: { [C.relation]: "related", [C.kinship]: "main" },
    concepts: { [C.concept]: "related", [C.type]: "related", [C.role]: "related", [C.person]: "main" } },
  { id: P.work, label: "协作", description: "突出同僚与组织成员，保留可展开的其他背景。",
    relations: { [C.relation]: "related", [C.colleague]: "main", [C.membership]: "main" },
    concepts: { [C.concept]: "related", [C.type]: "related", [C.role]: "related", [C.person]: "main", [C.organization]: "main" } },
  { id: P.events, label: "事件", description: "突出参与与发生地，亲族及协作关系收进相关。",
    relations: { [C.relation]: "related", [C.participation]: "main", [C.location]: "main" },
    concepts: { [C.concept]: "related", [C.type]: "related", [C.role]: "related", [C.event]: "main", [C.place]: "main", [C.person]: "main" } },
  { id: P.all, label: "全部关系", description: "沿所有关系探索概念；多人关系保留自己的枢纽。",
    relations: { [C.relation]: "main" }, concepts: { [C.concept]: "main", [C.type]: "main", [C.role]: "main" } },
];
export function perspectivePreset(settings: PerspectiveSettings): PerspectivePreset {
  const preset = PERSPECTIVES.find(p => p.id === settings.presetId);
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

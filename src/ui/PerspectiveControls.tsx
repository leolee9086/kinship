/** 视角编辑只修改分类的显示策略，几何样式在独立的布局设置中。 */
import { C, type Concept, type DisplayMode, type GraphSettings } from "../domain/concepts";
import type { ConceptIndex } from "../domain/conceptIndex";
import { DISPLAY_MODES, displayMode, perspectivePreset } from "../domain/perspectives";
import { PerspectiveProfiles } from "./PerspectiveProfiles";

export function PerspectiveControls({ index, settings, onChange }: {
  index: ConceptIndex; settings: GraphSettings; onChange: (patch: Partial<GraphSettings>) => void;
}) {
  const selected = perspectivePreset(settings.perspective);
  const override = settings.perspective.overrides[selected.id] ?? { relations: {}, concepts: {} };
  const change = (scope: "relations" | "concepts", type: string, mode: DisplayMode) => onChange({ perspective: {
    ...settings.perspective, overrides: { ...settings.perspective.overrides,
      [selected.id]: { ...override, [scope]: { ...override[scope], [type]: mode } },
    },
  } });
  const row = (type: Concept, scope: "relations" | "concepts") => <label className="rule-row" key={type.id}>
    <span>{type.label}</span><select aria-label={`${type.label}的显示方式`} value={displayMode(index, { ...type, types: [type.id] }, scope, settings.perspective)}
      onChange={e => change(scope, type.id, e.target.value as DisplayMode)}>{DISPLAY_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
  </label>;
  // 顶层分类来自概念层级，而不是演示家谱的固定分类表。新增物理/小说类型即刻出现。
  const allTypes = index.concepts.filter(c => index.isType(c));
  const relationRoots = allTypes.filter(c => c.broader?.includes(C.relation));
  const conceptRoots = allTypes.filter(c => c.broader?.includes(C.concept)
    && c.id !== C.type && c.id !== C.role && c.id !== C.relation);
  const relationTypes = allTypes.filter(c => index.descends(c.id, C.relation));
  return <div className="settings-body">
    <span className="eyebrow">CHOOSE WHAT MATTERS</span><h3>主要看哪些关系？</h3>
    <PerspectiveProfiles value={settings.perspective} onChange={perspective => onChange({ perspective })} />
    {relationRoots.map(c => row(c, "relations"))}
    <section><h3>主要突出哪些概念？</h3>{conceptRoots.map(c => row(c, "concepts"))}</section>
    <details><summary>细分关系与自定义分类</summary>
      {relationTypes.filter(c => !relationRoots.some(root => root.id === c.id)).map(c => row(c, "relations"))}
      {allTypes.filter(c => !index.descends(c.id, C.relation) && !conceptRoots.some(root => root.id === c.id)).map(c => row(c, "concepts"))}
    </details>
    <p className="muted">子分类继承最近的显示规则。主轴决定展开；淡显只补充上下文；“相关”按需展开；隐藏不进入当前投影。焦点始终可见。</p>
    <button onClick={() => { const overrides = { ...settings.perspective.overrides }; delete overrides[selected.id]; onChange({ perspective: { ...settings.perspective, overrides } }); }}>恢复此视角预设</button>
  </div>;
}

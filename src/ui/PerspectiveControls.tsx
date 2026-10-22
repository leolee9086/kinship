/** 视角编辑只修改分类的显示策略，几何样式在独立的布局设置中。 */
import { C, type Concept, type DisplayMode, type GraphSettings } from "../domain/concepts";
import type { ConceptIndex } from "../domain/conceptIndex";
import { DISPLAY_MODES, PERSPECTIVES, displayMode, perspectivePreset } from "../domain/perspectives";

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
  const relationRoots = [C.kinship, C.social, C.context];
  const conceptRoots = [C.person, C.event, C.place, C.organization, C.document, C.family];
  const relationTypes = index.concepts.filter(c => index.isType(c) && index.descends(c.id, C.relation));
  return <div className="settings-body">
    <span className="eyebrow">CHOOSE WHAT MATTERS</span><h3>主要看哪些关系？</h3>
    <label>视角预设<select aria-label="视角预设" value={selected.id} onChange={e => onChange({ perspective: { ...settings.perspective, presetId: e.target.value } })}>
      {PERSPECTIVES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select></label><p className="muted">{selected.description}</p>
    {relationRoots.map(id => row(index.get(id), "relations"))}
    <section><h3>主要突出哪些概念？</h3>{conceptRoots.map(id => row(index.get(id), "concepts"))}</section>
    <details><summary>细分关系与自定义分类</summary>
      {relationTypes.filter(c => !relationRoots.includes(c.id as typeof relationRoots[number])).map(c => row(c, "relations"))}
      {index.concepts.filter(c => index.isType(c) && !index.descends(c.id, C.relation) && !conceptRoots.includes(c.id as typeof conceptRoots[number])).map(c => row(c, "concepts"))}
    </details>
    <p className="muted">子分类继承最近的显示规则。主轴决定展开；淡显只补充上下文；“相关”按需展开；隐藏不进入当前投影。焦点始终可见。</p>
    <button onClick={() => { const overrides = { ...settings.perspective.overrides }; delete overrides[selected.id]; onChange({ perspective: { ...settings.perspective, overrides } }); }}>恢复此视角预设</button>
  </div>;
}

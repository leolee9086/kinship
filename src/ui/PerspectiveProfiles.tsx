/** 视角配置的生命周期。分类显示规则由相邻组件编辑，定义随设置走适配器保存。 */
import { C, newId, type PerspectivePreset, type PerspectiveSettings } from "../domain/concepts";
import { perspectivePreset } from "../domain/perspectives";

export function PerspectiveProfiles({ value, onChange }: {
  value: PerspectiveSettings; onChange: (next: PerspectiveSettings) => void;
}) {
  const selected = perspectivePreset(value);
  const update = (patch: Partial<PerspectivePreset>) => onChange({ ...value,
    presets: value.presets.map(p => p.id === selected.id ? { ...p, ...patch } : p) });
  const create = (copy: boolean) => {
    const changes = value.overrides[selected.id];
    const preset: PerspectivePreset = {
      id: newId(), label: copy ? `${selected.label} 副本` : "新视角", description: copy ? selected.description : "按分类配置自己的阅读范围。",
      relations: copy ? { ...selected.relations, ...changes?.relations } : { [C.relation]: "main" },
      concepts: copy ? { ...selected.concepts, ...changes?.concepts } : { [C.concept]: "main" },
    };
    onChange({ ...value, presetId: preset.id, presets: [...value.presets, preset] });
  };
  const remove = () => {
    const presets = value.presets.filter(p => p.id !== selected.id);
    if (!presets.length) return;
    const overrides = { ...value.overrides }; delete overrides[selected.id];
    onChange({ presetId: presets[0].id, presets, overrides });
  };
  return <section className="profile-controls">
    <label>视角<select aria-label="视角预设" value={selected.id} onChange={e => onChange({ ...value, presetId: e.target.value })}>
      {value.presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select></label>
    <label>名称<input key={`${selected.id}:${selected.label}`} aria-label="视角名称" defaultValue={selected.label}
      onBlur={e => { const label = e.currentTarget.value.trim(); if (label && label !== selected.label) update({ label }); }} /></label>
    <label>说明<textarea key={`${selected.id}:${selected.description}`} aria-label="视角说明" rows={2} defaultValue={selected.description}
      onBlur={e => { if (e.currentTarget.value !== selected.description) update({ description: e.currentTarget.value }); }} /></label>
    <div className="profile-actions"><button type="button" onClick={() => create(false)}>新建视角</button>
      <button type="button" onClick={() => create(true)}>复制视角</button>
      <button type="button" disabled={value.presets.length <= 1} onClick={remove}>删除视角</button></div>
  </section>;
}

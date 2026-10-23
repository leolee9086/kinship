/** 统一编辑器：类型与角色也作为概念编辑，关系可有任意多个带 UUID 的参与槽。 */
import { useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";
import { useFormKeyboard } from "./useFormKeyboard";
import { C, newId, type Concept, type Participation } from "../domain/concepts";
import { ConceptIndex } from "../domain/conceptIndex";
export type EditorMode = "concept" | "relation" | "type" | "role";

export function ConceptEditor({ index, initial, mode, focus, busy, onSave, onClose }: {
  index: ConceptIndex; initial?: Concept; mode: EditorMode; focus: string | null; busy: boolean;
  onSave: (concept: Concept) => Promise<void>; onClose: () => void;
}) {
  const [id] = useState(() => initial?.id ?? newId());
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [aliases, setAliases] = useState(initial?.aliases?.join("，") ?? "");
  const [typeId, setType] = useState(initial?.types[0] ?? (mode === "type" ? C.type : mode === "role" ? C.role : mode === "relation" ? C.relation : C.concept));
  const [broader, setBroader] = useState(initial?.broader?.[0] ?? (mode === "type" ? C.concept : ""));
  const [color, setColor] = useState(initial?.schema?.color ?? "#527fbd");
  const [properties, setProperties] = useState(JSON.stringify(initial?.properties ?? {}, null, 2));
  const [participants, setParticipants] = useState<Participation[]>(() => initial?.participants
    ? structuredClone(initial.participants) : mode === "relation"
      ? [{ id: newId(), role: C.participant, concept: focus ?? "" }, { id: newId(), role: C.participant, concept: "" }] : []);
  const [formError, setFormError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const running = useRef(false), error = useRef<HTMLParagraphElement>(null), locked = busy || saving;
  const close = () => { if (!locked) onClose(); };
  const dialog = useDialogFocus(close), keyboard = useFormKeyboard(locked);
  const types = index.concepts.filter(c => index.isType(c));
  const roles = index.concepts.filter(c => index.isRole(c));
  const entities = index.concepts.filter(c => !index.isType(c) && !index.isRole(c));
  const changeSlot = (slot: string, patch: Partial<Participation>) => setParticipants(ps => ps.map(p => p.id === slot ? { ...p, ...patch } : p));
  const addSlot = () => {
    const slotId = newId(); setParticipants(ps => [...ps, { id: slotId, role: C.participant, concept: "" }]);
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-slot-id="${slotId}"] select`)?.focus());
  };
  const removeSlot = (slotId: string) => {
    const at = participants.findIndex(p => p.id === slotId), next = participants[at + 1] ?? participants[at - 1];
    setParticipants(ps => ps.filter(p => p.id !== slotId));
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(next ? `[data-slot-id="${next.id}"] select` : "[data-add-participant]")?.focus());
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setFormError(null);
    if (running.current) return;
    running.current = true; setSaving(true);
    try {
      const parsed = JSON.parse(properties);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("属性需要 JSON 对象");
      const concept: Concept = { ...initial, id, label: label.trim(), description: description.trim(),
        aliases: aliases.split(/[，,]/).map(s => s.trim()).filter(Boolean),
        types: initial ? [typeId, ...initial.types.slice(1)] : [typeId], properties: parsed };
      if (mode === "type" || mode === "role") {
        concept.broader = broader ? [broader] : [];
        if (mode === "type") concept.schema = { ...initial?.schema, color };
      }
      if (mode === "relation" || initial?.participants) concept.participants = participants;
      await onSave(concept);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
      requestAnimationFrame(() => error.current?.focus());
    } finally { running.current = false; setSaving(false); }
  };
  return <div className="modal-scrim" onClick={close}>
    <section ref={dialog} className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title" aria-describedby="editor-keys" aria-busy={locked} onClick={e => e.stopPropagation()}>
      <header><div><span className="eyebrow">CONCEPT STUDIO</span><h2 id="editor-title">{initial ? "编辑概念" : mode === "relation" ? "创建关系概念" : mode === "type" ? "创建类型概念" : mode === "role" ? "创建角色概念" : "创建概念"}</h2></div><button disabled={locked} aria-label="关闭编辑器" onClick={close}>×</button></header>
      <form {...keyboard} onSubmit={e => void submit(e)}>
        <p id="editor-keys" className="editor-key-hint">Tab / Shift+Tab 切换 · 单行 Enter 下一项 · Ctrl / ⌘+Enter 保存 · Esc 关闭</p>
        <fieldset className="concept-editor-fields" disabled={locked} aria-label="概念字段">
        <label>名称<input autoFocus required value={label} onChange={e => setLabel(e.target.value)} placeholder="给这个概念一个名字" /></label>
        <label>类型<select value={typeId} onChange={e => setType(e.target.value)}>
          {types.filter(t => mode !== "relation" || index.descends(t.id, C.relation)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select></label>
        <label>说明<textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label>别名<input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="用逗号分隔" /></label>
        {(mode === "type" || mode === "role") && <div className="field-row"><label>上级分类<select value={broader} onChange={e => setBroader(e.target.value)}>
          <option value="">无上级</option>{(mode === "role" ? roles : types).filter(t => t.id !== id).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select></label>{mode === "type" && <label>默认颜色<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>}</div>}
        {(mode === "relation" || initial?.participants) && <fieldset><legend>参与槽 · 两人或多人</legend>
          {participants.map((p, i) => <div className="participant-row" key={p.id} data-slot-id={p.id}>
            <label>角色 {i + 1}<select value={p.role} onChange={e => changeSlot(p.id, { role: e.target.value })}>{roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            <label>概念 {i + 1}<select required value={p.concept} onChange={e => changeSlot(p.id, { concept: e.target.value })}><option value="">选择概念</option>
              <optgroup label="实例概念">{entities.filter(c => c.id !== id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
              <optgroup label="类型与角色">{index.concepts.filter(c => index.isType(c) || index.isRole(c)).filter(c => c.id !== id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
            </select></label><button type="button" aria-label={`移除参与槽 ${i + 1}`} onClick={() => removeSlot(p.id)}>−</button>
          </div>)}
          <button type="button" data-add-participant onClick={addSlot}>＋ 添加参与槽</button>
        </fieldset>}
        <details><summary>属性与身份</summary><code className="uuid">{id}</code><label>属性 JSON<textarea rows={4} value={properties} onChange={e => setProperties(e.target.value)} spellCheck={false} /></label></details>
        </fieldset>
        {formError && <p ref={error} tabIndex={-1} role="alert" className="form-error">{formError}</p>}
        <footer><button type="button" disabled={locked} onClick={close}>取消</button><button type="submit" className="primary" disabled={locked} aria-keyshortcuts="Control+Enter Meta+Enter">{locked ? "正在保存…" : "保存概念"}</button></footer>
      </form>
    </section>
  </div>;
}

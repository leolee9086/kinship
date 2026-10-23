/** 完整事实的详情展示独立于画布过滤；遗忘对象仍可经明确引用阅读和恢复。 */
import type { DataAdapter } from "../adapter/api";
import type { Concept } from "../domain/concepts";
import type { ConceptIndex } from "../domain/conceptIndex";
import { coreVocabulary } from "../domain/coreVocabulary";
import { explorationExclusions } from "../domain/lifecycle";
import { GraphPackageExport } from "./GraphPackageExport";
import { LifecycleControls } from "./LifecycleControls";
interface DetailActions {
  focus: (id: string) => void; edit: (concept: Concept) => void; inspect: (id: string) => void;
  toggleExpanded: (id: string) => void; deleteConcept: (id: string) => void;
  lifecycle: (target: { id: string; label: string; version: number; forgotten: boolean }) => void;
  reportError: (message: string) => void; body: (concept: Concept) => void;
}
export function ConceptDetails({ adapter, index, concept, version, busy, locked, expanded, actions }: {
  adapter: DataAdapter; index: ConceptIndex; concept: Concept; version: number; busy: boolean; locked: boolean; expanded: boolean; actions: DetailActions;
}) {
  const excluded = explorationExclusions(index);
  return <div className="inspector-body"><span className="type-badge">{index.typeLabel(concept)}</span><h3>{concept.label}</h3>
    <p>{concept.description || "可以添加说明，记录这个概念的含义与背景。"}</p>
    <div className="detail-actions"><button className="primary" onClick={() => actions.focus(concept.id)}>作为焦点</button><button disabled={busy || locked} onClick={() => actions.edit(concept)}>编辑</button><button disabled={busy || locked} onClick={() => actions.body(concept)}>正文</button></div>
    {concept.participants && <section><h4>参与概念 · {concept.participants.length}</h4>{concept.participants.map(p => <button className="participant-link" key={p.id} onClick={() => actions.focus(p.concept)}>
      <span>{index.roleLabel(p.role)}</span><strong>{index.get(p.concept).label}{index.get(p.concept).forgotten && " · 已遗忘"}</strong><span>↗</span></button>)}
      <button onClick={() => actions.toggleExpanded(concept.id)}>{expanded ? "压缩关系表示" : "展开为关系节点"}</button><p className="muted">多元关系保留枢纽；二元关系可以在线与节点间切换，身份不变。</p></section>}
    {!!index.relations(concept.id).length && <section><h4>参与的关系 · {index.relations(concept.id).length}</h4>{index.relations(concept.id).map(r =>
      <button className="related-item" key={r.id} onClick={() => actions.inspect(r.id)}>{r.label}<small>{r.forgotten ? "已遗忘 · " : excluded.has(r.id) ? "探索已收起 · " : ""}{index.typeLabel(r)}</small></button>)}</section>}
    <section><h4>类型与上级</h4>{[...concept.types, ...(concept.broader ?? [])].map((id, i) => <button className="inline-link" key={`${id}:${i}`} onClick={() => actions.focus(id)}>
      {index.get(id).label}{index.get(id).forgotten && " · 已遗忘"} ↗</button>)}</section>
    {concept.properties && Object.entries(concept.properties).map(([key, value]) => <p className="property" key={key}><span>{key}</span><strong>{typeof value === "string" ? value : JSON.stringify(value)}</strong></p>)}
    <LifecycleControls concept={concept} version={version} disabled={busy || locked} onChange={actions.lifecycle} />
    <GraphPackageExport key={concept.id} adapter={adapter} conceptId={concept.id} disabled={busy || locked} onError={actions.reportError} />
    <details><summary>概念 UUID</summary><code className="uuid">{concept.id}</code></details>
    <button className="danger-text" disabled={busy || locked || coreVocabulary.has(concept.id)} onClick={() => actions.deleteConcept(concept.id)}>检查删除影响…</button>
  </div>;
}

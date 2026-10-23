/** 概念和关系使用相同生命周期动作，内核根受保护；不在此读写数据库。 */
import type { Concept } from "../domain/concepts";
import { coreVocabulary } from "../domain/coreVocabulary";
interface LifecycleTarget { id: string; label: string; version: number; forgotten: boolean }
export function LifecycleControls({ concept, version, disabled, onChange }: {
  concept: Concept; version: number; disabled: boolean; onChange: (target: LifecycleTarget) => void;
}) {
  return <section className="lifecycle-controls" aria-label="概念生命周期"><h4>{concept.forgotten ? "已遗忘" : "遗忘与恢复"}</h4>
    <p>遗忘会从普通目录与画布探索中收起。内容、引用和参与槽保留，可在概念库的“已遗忘”中找回。</p>
    <button disabled={disabled || coreVocabulary.has(concept.id)} onClick={() => onChange({ id: concept.id, label: concept.label, version, forgotten: !concept.forgotten })}>
      {concept.forgotten ? "恢复概念" : "遗忘概念"}</button>
  </section>;
}

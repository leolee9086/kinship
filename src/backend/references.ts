/** 保存设置只读配置引用的类型/角色闭包，不为一次焦点导航加载十万概念。 */
import type { Concept, GraphSettings } from "../domain/concepts";
import type { ConceptRecord } from "../contracts/commands";
import { ConceptIndex } from "../domain/conceptIndex";
import { InputError } from "../domain/inputValidation";

export function presentationIds(settings: GraphSettings): Set<string> {
  const ids = new Set<string>();
  const categories = [...settings.perspective.presets, ...Object.values(settings.perspective.overrides)];
  for (const p of categories) for (const id of [...Object.keys(p.concepts), ...Object.keys(p.relations)]) ids.add(id);
  for (const view of settings.views) {
    view.primaryTypes.forEach(id => ids.add(id));
    for (const rule of view.rules) {
      ids.add(rule.relationType);
      if (rule.focusRole) ids.add(rule.focusRole);
      if (rule.otherRole) ids.add(rule.otherRole);
    }
  }
  return ids;
}

export function readConceptClosure(store: IDBObjectStore, roots: Iterable<string>, done: (index: ConceptIndex) => void,
  fail: (error: Error) => void): void {
  const seen = new Set<string>(), records: Concept[] = [];
  let pending = 0, seeded = false, failed = false;
  const enqueue = (id: string) => {
    if (seen.has(id) || failed) return;
    seen.add(id);
    if (seen.size > 20_000) { failed = true; fail(new InputError("配置引用闭包超过两万项，请缩小配置范围")); return; }
    pending++;
    const request = store.get(id);
    request.onsuccess = () => {
      if (failed) return;
      const c = (request.result as ConceptRecord | undefined)?.concept;
      if (c) {
        records.push(c);
        // 只解析身份分类，不沿参与者或关系入边扩展业务图。
        for (const dependency of [...c.types, ...(c.broader ?? [])]) enqueue(dependency);
      }
      pending--;
      if (seeded && pending === 0 && !failed) done(new ConceptIndex(records));
    };
  };
  for (const id of roots) enqueue(id);
  seeded = true;
  if (pending === 0 && !failed) done(new ConceptIndex(records));
}

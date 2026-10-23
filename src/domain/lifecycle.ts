/** 遗忘保留事实，只收起探索投影。关系作为参与对象时沿入向引用迭代，环不会递归溢出。 */
import type { ConceptIndex } from "./conceptIndex";
const exclusions = new WeakMap<ConceptIndex, ReadonlySet<string>>();
export function explorationExclusions(index: ConceptIndex): ReadonlySet<string> {
  const cached = exclusions.get(index);
  if (cached) return cached;
  const hidden = new Set<string>(), queue: string[] = [];
  for (const concept of index.concepts) if (concept.forgotten) { hidden.add(concept.id); queue.push(concept.id); }
  // 多人事实的一个参与者被遗忘时，整条关系收起；不能画出缺失参与者的部分事实。
  for (let at = 0; at < queue.length; at++) for (const relation of index.relations(queue[at])) {
    if (hidden.has(relation.id)) continue;
    hidden.add(relation.id); queue.push(relation.id);
  }
  exclusions.set(index, hidden); return hidden;
}

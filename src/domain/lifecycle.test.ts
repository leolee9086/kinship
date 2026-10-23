/** 遗忘过滤只影响探索；分类身份、完整事实与明确打开的焦点仍可读取。 */
import { expect, it } from "vitest";
import { C, newId, type Concept } from "./concepts";
import { ConceptIndex } from "./conceptIndex";
import { ConceptCatalog } from "./conceptCatalog";
import { initialSnapshot } from "./ontology";
import { explorationExclusions } from "./lifecycle";
import { projectGraph } from "./projection";
const entity = (label: string, forgotten?: true): Concept => ({ id: newId(), label, types: [C.concept], ...(forgotten ? { forgotten } : {}) });
const relation = (label: string, ids: string[]): Concept => ({ id: newId(), label, types: [C.relation], participants: ids.map(concept => ({ id: newId(), concept, role: C.participant })) });
it("collects nested relation exclusions without truncating multiparty facts and keeps an explicitly opened focus", () => {
  const seed = initialSnapshot("blank"), a = entity("已遗忘", true), b = entity("保留"), c = entity("第三人");
  const multi = relation("三方事实", [a.id, b.id, c.id]), nested = relation("嵌套事实", [multi.id, c.id]), active = relation("独立事实", [b.id, c.id]);
  const index = new ConceptIndex([...seed.concepts, a, b, c, multi, nested, active]), hidden = explorationExclusions(index);
  expect([...hidden]).toEqual([a.id, multi.id, nested.id]); expect(explorationExclusions(index)).toBe(hidden);
  const result = projectGraph(index, b.id, { ...seed.settings, depth: 3 });
  expect(result.nodes.has(a.id)).toBe(false); expect(result.links.some(link => link.relationId === multi.id || link.relationId === nested.id)).toBe(false);
  expect(result.links.some(link => link.relationId === active.id)).toBe(true);
  const explicit = projectGraph(index, a.id, seed.settings);
  expect([...explicit.nodes.keys()]).toEqual([a.id]); expect(explicit.links).toEqual([]);
  expect([...projectGraph(index, nested.id, seed.settings).nodes.keys()]).toEqual([nested.id]);
  expect(index.get(multi.id).participants).toHaveLength(3);
});
it("forgetting one relation keeps a same-pair independent fact and restoring recovers the original projection", () => {
  const seed = initialSnapshot("blank"), a = entity("甲"), b = entity("乙"), first = relation("第一事实", [a.id, b.id]), second = relation("第二事实", [a.id, b.id]);
  const project = (facts: Concept[]) => projectGraph(new ConceptIndex([...seed.concepts, a, b, ...facts]), a.id, seed.settings);
  const original = project([first, second]), hidden = project([{ ...first, forgotten: true }, second]);
  expect(hidden.links.some(link => link.relationId === first.id)).toBe(false); expect(hidden.links.some(link => link.relationId === second.id)).toBe(true);
  expect(project([first, second])).toEqual(original);
});
it("filters normal, forgotten and all catalogs without changing category semantics or Unicode search", () => {
  const seed = initialSnapshot("blank"), active = entity("同名"), forgotten = { ...entity("同名", true), aliases: ["INERTIA 惯性"] };
  const category: Concept = { id: newId(), label: "遗忘类型", types: [C.type], broader: [C.concept], forgotten: true };
  const role: Concept = { id: newId(), label: "遗忘角色", types: [C.role], forgotten: true };
  const instance: Concept = { id: newId(), label: "仍有效的实例", types: [category.id] };
  const index = new ConceptIndex([...seed.concepts, active, forgotten, category, role, instance]), catalog = new ConceptCatalog(index), p = seed.settings.perspective;
  expect(catalog.search("instances", "同名", p).map(c => c.id)).toEqual([active.id]);
  expect(catalog.search("instances", "INERTIA 惯性", p, "forgotten").map(c => c.id)).toEqual([forgotten.id]);
  expect(catalog.search("instances", "同名", p, "all")).toHaveLength(2);
  expect(catalog.search("types", "", p, "forgotten")).toEqual([category]); expect(catalog.search("roles", "", p, "forgotten")).toEqual([role]);
  expect(catalog.search("instances", "仍有效", p)).toEqual([instance]); expect(index.isType(category)).toBe(true); expect(index.isRole(role)).toBe(true);
  expect(explorationExclusions(index).has(instance.id)).toBe(false);
});
it("propagates through cyclic and deep relation participation iteratively", () => {
  const seed = initialSnapshot("blank"), root = entity("遗忘入口", true), other = entity("另一对象"), facts: Concept[] = [];
  let previous = root.id;
  for (let at = 0; at < 5000; at++) { const fact = relation(`事实 ${at}`, [previous, other.id]); facts.push(fact); previous = fact.id; }
  facts[0].participants!.push({ id: newId(), role: C.participant, concept: previous });
  const hidden = explorationExclusions(new ConceptIndex([...seed.concepts, root, other, ...facts]));
  expect(hidden.size).toBe(5001); expect(hidden.has(previous)).toBe(true); expect(hidden.has(other.id)).toBe(false);
});

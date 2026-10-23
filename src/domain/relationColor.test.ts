/** 用没有亲属角色的自定义领域验收赋色，避免测试只能证明演示家谱有效。 */
import { expect, it } from "vitest";
import { C, newId, type Concept } from "./concepts";
import { builtinConcepts } from "./ontology";
import { ConceptIndex } from "./conceptIndex";
import { relationColor } from "./projection";
import { starterSettings } from "../templates/starter";
import { applyMutation } from "./validation";

it("colors arbitrary ordered roles and their classifications without a family-specific root", () => {
  const source: Concept = { id: newId(), label: "因果来源", types: [C.role] };
  const force: Concept = { id: newId(), label: "作用力", types: [C.role], broader: [source.id] };
  const response: Concept = { id: newId(), label: "响应", types: [C.role] };
  const relation: Concept = { id: newId(), label: "力改变运动", types: [C.relation], participants: [
    { id: newId(), role: force.id, concept: C.concept }, { id: newId(), role: response.id, concept: C.concept },
  ] };
  const index = new ConceptIndex([...builtinConcepts(), source, force, response, relation]);
  const settings = { ...starterSettings(), colorAxis: "first-role" as const, colorDepth: 0 };
  expect(relationColor(index, relation, settings).colorKey).toBe(source.id);
  expect(relationColor(index, relation, { ...settings, colorDepth: 1 }).colorKey).toBe(force.id);
  expect(relationColor(index, relation, { ...settings, colorAxis: "second-role" }).colorKey).toBe(response.id);
  expect(relationColor(index, relation, { ...settings, colorAxis: "role-pair" }).colorKey).toBe(`pair:${source.id}:${response.id}`);
});
it("protects only semantic roots, while an unused template category can be deleted", () => {
  const values = builtinConcepts(), standalone = values.find(concept => concept.label === "家庭")!;
  expect(applyMutation(values, { remove: [standalone.id] }).some(concept => concept.id === standalone.id)).toBe(false);
  expect(() => applyMutation(values, { remove: [C.concept] })).toThrow("不能删除通用语义根");
});

/** 模板文件使用普通概念契约；校验文件可独立重放且不会污染其他新工作区。 */
import { expect, it } from "vitest";
import vocabulary from "../templates/starter-vocabulary.json";
import demo from "../templates/starter-demo.json";
import { builtinConcepts, initialSnapshot } from "../domain/ontology";
import { readConceptFile, writeConceptFile } from "./concepts";
import { C } from "../domain/concepts";

it("round-trips UUID concepts and slots with explicit external vocabulary, without shared template objects", () => {
  const dependencies = builtinConcepts(), value = readConceptFile(demo, dependencies);
  expect(readConceptFile(writeConceptFile(value, dependencies), dependencies)).toEqual(value);
  const first = initialSnapshot(), second = initialSnapshot();
  expect(first.concepts).toEqual(second.concepts); expect(first.concepts).toHaveLength(65);
  const relation = first.concepts.find(concept => concept.participants)!;
  relation.participants![0].role = C.participant;
  first.concepts[0].label = "已编辑";
  expect(initialSnapshot()).toEqual(second);
});
it("rejects unsupported versions, unknown fields and missing UUID dependencies", () => {
  expect(() => readConceptFile({ ...vocabulary, spec: 2 })).toThrow();
  expect(() => readConceptFile({ ...vocabulary, unknown: true })).toThrow();
  expect(() => readConceptFile(demo)).toThrow("类型引用无效");
  const corrupt = structuredClone(demo);
  const relation = corrupt.concepts.find(concept => concept.participants)!;
  relation.participants![0].id = relation.id;
  expect(() => readConceptFile(corrupt, builtinConcepts())).toThrow("参与槽不能复用概念 UUID");
});

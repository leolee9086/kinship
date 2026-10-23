/** 内置起点只是版本化 JSON 模板；已有工作区始终从数据库读取，不会再次执行种子。 */
import vocabulary from "../templates/starter-vocabulary.json";
import demo from "../templates/starter-demo.json";
import blankProject from "../templates/blank-project.json";
import { readConceptFile } from "../format/concepts";
import { starterSettings } from "../templates/starter";
import type { Concept, ConceptSnapshot } from "./concepts";

export function builtinConcepts(): Concept[] {
  return readConceptFile(vocabulary).concepts;
}
export function initialSnapshot(seed: "demo" | "blank" = "demo"): ConceptSnapshot {
  const vocabularyConcepts = builtinConcepts();
  const example = seed === "demo" ? readConceptFile(demo, vocabularyConcepts) : { concepts: [], focusId: null };
  const concepts = [...vocabularyConcepts, ...example.concepts];
  const settings = starterSettings();
  settings.focusId = example.focusId ?? null;
  if (seed === "blank") { settings.viewId = blankProject.viewId; settings.perspective.presetId = blankProject.perspectiveId; }
  return { version: 1, concepts, settings, revision: 0, conceptVersions: Object.fromEntries(concepts.map(concept => [concept.id, 1])),
    presentationVersion: 1, viewStateVersion: 1 };
}

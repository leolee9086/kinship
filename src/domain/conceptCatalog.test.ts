import { expect, it } from "vitest";
import { builtinConcepts } from "./ontology";
import { C, P, newId, type Concept } from "./concepts";
import { starterSettings } from "../templates/starter";
import { ConceptIndex } from "./conceptIndex";
import { ConceptCatalog } from "./conceptCatalog";
import { virtualWindow } from "../ui/virtualWindow";

it("indexes custom physics categories, aliases, Unicode and inherited perspective rules", () => {
  const quantity: Concept = { id: newId(), label: "物理量", types: [C.type], broader: [C.concept] };
  const force: Concept = { id: newId(), label: "力", aliases: ["Ｆ", "Force"], types: [quantity.id] };
  const acceleration: Concept = { id: newId(), label: "加速度", description: "单位 m/s²", types: [quantity.id] };
  const concepts = [...builtinConcepts(), quantity, force, acceleration];
  const settings = starterSettings().perspective;
  settings.overrides[P.genealogy] = { relations: {}, concepts: { [quantity.id]: "main" } };
  const catalog = new ConceptCatalog(new ConceptIndex(concepts));
  expect(catalog.search("instances", "f 物理量", settings)).toEqual([force]);
  expect(catalog.search("instances", "Ｍ／Ｓ", settings)).toEqual([acceleration]);
  expect(catalog.search("types", "物理量", settings)).toEqual([quantity]);
  expect(catalog.search("instances", "", settings)).toHaveLength(2);
});

it("keeps large catalog queries and list windows bounded after filtering or resizing", () => {
  const instances = Array.from({ length: 100_000 }, (_, n): Concept => ({
    id: newId(), label: `物理概念 ${n}`, aliases: [`physics-${n}`], types: [C.concept],
  }));
  const started = performance.now();
  const catalog = new ConceptCatalog(new ConceptIndex([...builtinConcepts(), ...instances]));
  const indexed = performance.now();
  const settings = starterSettings().perspective; settings.presetId = P.all;
  const all = catalog.search("instances", "", settings);
  const ranked = performance.now();
  expect(all).toHaveLength(100_000);
  expect(catalog.search("instances", "physics-99999", settings)).toHaveLength(1);
  const searched = performance.now();
  const bottom = virtualWindow(all.length, 5_799_500, 660, 58);
  expect(bottom.end).toBe(100_000);
  expect(bottom.end - bottom.start).toBeLessThanOrEqual(24);
  const filtered = virtualWindow(1, 5_799_500, 660, 58);
  expect(filtered).toEqual({ start: 0, end: 1, before: 0, after: 0 });
  expect(virtualWindow(0, 5_799_500, 300, 58)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
  console.log(`catalog 100k: index ${(indexed - started).toFixed(0)}ms, initial ranking ${(ranked - indexed).toFixed(0)}ms, cached search ${(searched - ranked).toFixed(0)}ms`);
});

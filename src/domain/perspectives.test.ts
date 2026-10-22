import { describe, expect, it } from "vitest";
import { C, P, newId, type Concept } from "./concepts";
import { starterSettings } from "../templates/starter";
import { initialSnapshot } from "./ontology";
import { ConceptIndex } from "./conceptIndex";
import { displayMode } from "./perspectives";
import { projectGraph } from "./projection";
import { layoutConcepts } from "../ui/conceptLayout";
import { buildCurves, cubicPoint, routeCurve } from "../ui/edges";
import { nodeBox, UNIT_PX } from "../ui/graphGeometry";

const setup = () => {
  const snap = initialSnapshot(), index = new ConceptIndex(snap.concepts);
  const byLabel = (label: string) => snap.concepts.find(c => c.label === label)!;
  return { snap, index, byLabel };
};
describe("perspective filtering before layout", () => {
  it("keeps a clean person/kinship axis and folds independent same-pair colleague facts", () => {
    const { snap, index, byLabel } = setup(), focus = byLabel("林承远").id;
    const graph = projectGraph(index, focus, snap.settings);
    expect([...graph.nodes.keys()].every(id => index.isA(id, C.person))).toBe(true);
    expect(graph.links.every(l => index.isA(l.relationId, C.kinship))).toBe(true);
    expect(graph.related.some(r => r.relationId === byLabel("父子同时也是同僚").id)).toBe(true);
    const noChange = projectGraph(index, focus, { ...snap.settings, viewId: "work" });
    expect(new Set(noChange.links.map(l => l.relationId))).toEqual(new Set(graph.links.map(l => l.relationId)));
    const events = projectGraph(index, focus, { ...snap.settings, perspective: { ...snap.settings.perspective, presetId: P.events } });
    expect(events.links.every(l => index.isA(l.relationId, C.participation) || index.isA(l.relationId, C.location))).toBe(true);
    expect(events.nodes.has(byLabel("地方史料整理会议").id)).toBe(true);
  });
  it("inherits custom subclasses, hides content, dims without recursion and reveals related without moving the axis", () => {
    const { snap, byLabel } = setup();
    const subtype: Concept = { id: newId(), label: "远程同僚", types: [C.type], broader: [C.colleague] };
    const colleague = byLabel("父子同时也是同僚"); colleague.types = [subtype.id];
    const index = new ConceptIndex([...snap.concepts, subtype]), focus = byLabel("林承远").id;
    const original = projectGraph(index, focus, snap.settings);
    expect(displayMode(index, colleague, "relations", snap.settings.perspective)).toBe("related");
    const changed = structuredClone(snap.settings);
    changed.perspective.overrides[P.genealogy] = { relations: { [C.social]: "dim" }, concepts: {} };
    const dim = projectGraph(index, focus, changed);
    const line = dim.links.find(l => l.relationId === colleague.id)!;
    expect(line.emphasis).toBe(changed.dimOpacity);
    expect(dim.nodes.get(byLabel("林见川").id)?.region).toBe(original.nodes.get(byLabel("林见川").id)?.region);
    changed.perspective.overrides[P.genealogy].relations[C.social] = "hidden";
    const hidden = projectGraph(index, focus, changed);
    expect(hidden.links.some(l => l.relationId === colleague.id)).toBe(false);
    expect(hidden.related.some(r => r.relationId === colleague.id)).toBe(false);
    const revealed = projectGraph(index, focus, snap.settings, 600, new Set([colleague.id]));
    expect(revealed.links.some(l => l.relationId === colleague.id)).toBe(true);
    expect(revealed.nodes.get(byLabel("林见川").id)?.region).toBe(original.nodes.get(byLabel("林见川").id)?.region);
    expect(projectGraph(index, byLabel("地方史料整理会议").id, snap.settings).nodes.has(byLabel("地方史料整理会议").id)).toBe(true);
  });
  it("labels exact roles on both ends and on each branch of a multi-party relation", () => {
    const { snap, index, byLabel } = setup();
    const g = projectGraph(index, byLabel("林承远").id, snap.settings);
    const fatherSon = g.links.find(l => l.relationId === byLabel("林承远与林见川的父子关系").id)!;
    expect(fatherSon.fromLabel).toBe("父"); expect(fatherSon.toLabel).toBe("子"); expect(fatherSon.label).toBe("亲子");
    const team = byLabel("三人共同整理史料");
    const hub = projectGraph(index, team.id, { ...snap.settings, perspective: { ...snap.settings.perspective, presetId: P.all } });
    const branches = hub.links.filter(l => l.relationId === team.id);
    expect(branches).toHaveLength(3);
    expect(branches.every(l => l.fromLabel === "" && l.toLabel === "同僚")).toBe(true);
  });
});

describe("four independent distances and reversible ports", () => {
  it("moves each region by its own box-edge gap only", () => {
    const { snap, index, byLabel } = setup(), focus = byLabel("林见川").id;
    snap.settings.perspective.presetId = P.all;
    const graph = projectGraph(index, focus, snap.settings);
    const measure = () => ({ width: 120, height: 44 });
    const before = layoutConcepts(graph, focus, measure, snap.settings.regionGaps);
    for (const side of ["up", "down", "left", "right"] as const) {
      const gaps = { ...snap.settings.regionGaps, [side]: snap.settings.regionGaps[side] + 80 };
      const after = layoutConcepts(graph, focus, measure, gaps);
      const item = [...before.values()].find(n => n.id !== focus && n.region === side);
      if (!item) continue;
      const other = after.get(item.id)!;
      expect(Math.abs(side === "up" || side === "down" ? other.y - item.y : other.x - item.x)).toBeGreaterThanOrEqual(80 / UNIT_PX - .001);
      expect(after.get(focus)).toEqual(before.get(focus));
    }
  });
  it("routes spouse and every other displayed relation outside both endpoint boxes for all foci and slot orders", () => {
    const { snap } = setup(); snap.settings.perspective.presetId = P.all;
    let tested = 0;
    for (const reversed of [false, true]) {
      const concepts = snap.concepts.map(c => c.participants && reversed ? { ...c, participants: [...c.participants].reverse() } : c);
      const index = new ConceptIndex(concepts);
      for (const focus of concepts.filter(c => !index.isType(c) && !index.isRole(c))) {
        const graph = projectGraph(index, focus.id, snap.settings);
        const positions = layoutConcepts(graph, focus.id, () => ({ width: 138, height: 44 }), snap.settings.regionGaps);
        for (const curve of buildCurves(positions, graph.links)) {
          const a = positions.get(curve.from)!, b = positions.get(curve.to)!;
          const boxes = [nodeBox(a), nodeBox(b)];
          for (let sample = 1; sample < 100; sample++) {
            const p = cubicPoint(curve, sample / 100);
            expect(boxes.some(box => p.x > box.left + .00001 && p.x < box.right - .00001 && p.y > box.top + .00001 && p.y < box.bottom - .00001)).toBe(false);
          }
          if (b.x + b.width / UNIT_PX / 2 < a.x - a.width / UNIT_PX / 2) expect(curve.fromPort).not.toBe("right");
          const rerouted = routeCurve(a, b, curve);
          expect(rerouted.fromPort).toBe(curve.fromPort);
          tested++;
        }
      }
    }
    expect(tested).toBeGreaterThan(200);
  });
});

it("indexes 100,000 UUID concepts while bounding a high-degree presentation", () => {
  const { snap, byLabel } = setup(), focus = byLabel("林承远").id;
  const concepts: Concept[] = [...snap.concepts];
  const relationType = snap.concepts.find(c => c.id === C.association)!;
  expect(relationType).toBeDefined();
  for (let i = 0; i < 50000; i++) {
    const id = newId();
    concepts.push({ id, label: `规模样例 ${i}`, types: [C.person] });
    concepts.push({ id: newId(), label: "规模关系", types: [C.association], participants: [
      { id: newId(), role: C.subject, concept: focus }, { id: newId(), role: C.object, concept: id },
    ] });
  }
  const started = performance.now(), index = new ConceptIndex(concepts);
  const settings = starterSettings(); settings.perspective.presetId = P.all; settings.depth = 1;
  const projected = projectGraph(index, focus, settings);
  expect(index.byId.size).toBeGreaterThan(100000);
  expect(projected.nodes.size).toBe(600); expect(projected.omitted).toBeGreaterThan(49000);
  expect(projected.links.length).toBeLessThan(1000);
  const elapsed = performance.now() - started;
  console.info(`100k concepts: index + bounded projection ${elapsed.toFixed(0)}ms`);
}, 15000);

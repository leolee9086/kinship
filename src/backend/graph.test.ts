/** 隔离 IDB 实例；不触碰浏览器真实家谱或概念仓库。 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { C, P, isUUID, newId, type Concept } from '../domain/concepts';
import { ConceptIndex } from '../domain/conceptIndex';
import { initialSnapshot } from '../domain/ontology';
import { projectGraph, relationColor } from '../domain/projection';
import { layoutConcepts } from '../ui/conceptLayout';
import { buildCurves, curveInViewport } from '../ui/edges';
import { validateConcepts } from '../domain/validation';
import { IndexedDbRepository } from './indexeddb';
import { buildDataRouter } from './routes';
import { createInternalDispatch } from '../adapter/internalDispatch';
import { createHttpAdapter } from '../adapter/api';

const instances: IndexedDbRepository[] = [];
async function isolated(name = 'test-' + crypto.randomUUID()) {
  const repository = new IndexedDbRepository(name);
  instances.push(repository);
  const adapter = createHttpAdapter(createInternalDispatch(buildDataRouter(repository)));
  return { repository, adapter, name };
}
afterEach(async () => { await Promise.all(instances.splice(0).map(r => r.close())); });

const find = (list: Concept[], label: string) => {
  const item = list.find(c => c.label === label);
  if (!item) throw new Error('Fixture missing: ' + label);
  return item;
};

describe('single concept identity and multirelations', () => {
  it('assigns UUIDs to all types, roles, concepts and participation slots', () => {
    const snap = initialSnapshot();
    expect(validateConcepts(snap.concepts)).toHaveLength(snap.concepts.length);
    expect(snap.concepts.every(c => isUUID(c.id) && c.types.every(isUUID))).toBe(true);
    expect(snap.concepts.flatMap(c => c.participants ?? []).every(p => isUUID(p.id) && isUUID(p.role) && isUUID(p.concept))).toBe(true);
    const fatherSon = find(snap.concepts, '林承远与林见川的父子关系');
    const colleagues = find(snap.concepts, '父子同时也是同僚');
    expect(fatherSon.id).not.toBe(colleagues.id);
    expect(fatherSon.participants!.map(p => p.concept)).toEqual(colleagues.participants!.map(p => p.concept));
    expect(find(snap.concepts, '纪要记载父子关系').participants!.some(p => p.concept === fatherSon.id)).toBe(true);
    expect(find(snap.concepts, '三人共同整理史料').participants).toHaveLength(3);
  });
  it('keeps two direct connections distinct, supports expanded relation focus and role-direction rules', () => {
    const s = initialSnapshot(), index = new ConceptIndex(s.concepts);
    const father = find(s.concepts, '林承远'), son = find(s.concepts, '林见川');
    s.settings.focusId = father.id;
    s.settings.perspective.presetId = P.all;
    const graph = projectGraph(index, father.id, s.settings);
    const links = graph.links.filter(l => [father.id, son.id].includes(l.from) && [father.id, son.id].includes(l.to));
    expect(links.map(l => l.relationId).length).toBeGreaterThanOrEqual(2);
    expect(new Set(links.map(l => l.relationId)).size).toBeGreaterThanOrEqual(2);
    expect(links.every(l => l.hop === 1)).toBe(true);
    expect(graph.nodes.get(son.id)?.region).toBe('down');
    const work = projectGraph(index, father.id, { ...s.settings, viewId: 'work' });
    expect(work.nodes.get(son.id)?.region).toBe('right');
    const reversed = projectGraph(index, son.id, s.settings);
    expect(reversed.nodes.get(father.id)?.region).toBe('up');
    const relation = find(s.concepts, '林承远与林见川的父子关系');
    const expanded = projectGraph(index, father.id, { ...s.settings, expandedRelations: [relation.id] });
    expect(expanded.nodes.has(relation.id)).toBe(true);
    const centered = projectGraph(index, relation.id, { ...s.settings, focusId: relation.id });
    expect(centered.distances.get(father.id)).toBe(1);
    expect(centered.distances.get(son.id)).toBe(1);
    expect(s.settings.views).toHaveLength(4);
  });
  it('separates color depth and layout, routes parallel relations, preserves whole-curve culling', () => {
    const s = initialSnapshot(), index = new ConceptIndex(s.concepts);
    const father = find(s.concepts, '林承远'), son = find(s.concepts, '林见川');
    const rel = find(s.concepts, '林承远与林见川的父子关系');
    const mother = find(s.concepts, '沈知微与林见川的母子关系');
    const depth0 = { ...s.settings, colorAxis: 'parent-role' as const, colorDepth: 0 };
    expect(relationColor(index, rel, depth0).colorKey).toBe(relationColor(index, mother, depth0).colorKey);
    const depth1 = { ...depth0, colorDepth: 1 };
    expect(relationColor(index, rel, depth1).colorKey).not.toBe(relationColor(index, mother, depth1).colorKey);
    s.settings.perspective.presetId = P.all;
    const graph = projectGraph(index, father.id, s.settings);
    const positioned = layoutConcepts(graph, father.id, () => ({ width: 126, height: 44 }), s.settings.regionGaps);
    const curves = buildCurves(positioned, graph.links);
    const between = curves.filter(c => [father.id, son.id].includes(c.from) && [father.id, son.id].includes(c.to));
    expect(between.length).toBeGreaterThanOrEqual(2);
    expect(new Set(between.map(c => c.relationId)).size).toBeGreaterThanOrEqual(2);
    expect(between[0].c1x).not.toBe(between[1].c1x);
    const crossing = { ...between[0], x1: -3, c1x: -1, c2x: 1, x2: 3, y1: 0, c1y: 0, c2y: 0, y2: 0 };
    expect(curveInViewport(crossing, { left: -.2, right: .2, top: -.2, bottom: .2 })).toBe(true);
  });
});

describe('internal fetch and isolated storage', () => {
  it('persists UUID concepts and preferences, atomically rejects dangling references', async () => {
    const { repository, adapter } = await isolated();
    const old = await adapter.load();
    const concept: Concept = { id: newId(), label: '新增演示地点', types: [C.place] };
    await adapter.mutate({ put: [concept] });
    const next = await adapter.load();
    expect(next.concepts.find(c => c.id === concept.id)?.label).toBe(concept.label);
    await adapter.saveSettings({ ...next.settings, focusId: concept.id, viewId: 'events', colorDepth: 3 });
    const persisted = await adapter.load();
    expect(persisted.settings.focusId).toBe(concept.id);
    expect(persisted.settings.viewId).toBe('events');
    expect(persisted.revision).toBe(old.revision + 1);
    const invalid: Concept = { id: newId(), label: '非法关系', types: [C.association], participants: [
      { id: newId(), role: C.subject, concept: crypto.randomUUID() },
    ] };
    await expect(adapter.mutate({ put: [invalid] })).rejects.toThrow();
    expect((await adapter.load()).concepts.some(c => c.id === invalid.id)).toBe(false);
    const link: Concept = { id: newId(), label: '记录这个地点', types: [C.association], participants: [
      { id: newId(), role: C.subject, concept: concept.id },
      { id: newId(), role: C.object, concept: find(persisted.concepts, '青浦镇').id },
    ] };
    await adapter.mutate({ put: [link] });
    await expect(adapter.mutate({ remove: [concept.id] })).rejects.toThrow();
    await adapter.mutate({ remove: [link.id, concept.id] });
    expect((await adapter.load()).concepts.some(c => c.id === concept.id)).toBe(false);
    expect((await adapter.load()).settings.focusId).toBe(null);
    expect(repository).toBeDefined();
  });
  it('uploads binary with multipart internal fetch, reopens, reads and removes background safely', async () => {
    const { adapter: first, repository, name } = await isolated();
    let adapter = first;
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10])], 'picture.png', { type: 'image/png' });
    const uploaded = await adapter.upload(file);
    expect(isUUID(uploaded.id)).toBe(true);
    expect((await adapter.mediaContent(uploaded.id)).size).toBe(6);
    expect((await adapter.mediaInfo(uploaded.id)).name).toBe('picture.png');
    const settings = (await adapter.load()).settings;
    await adapter.saveSettings({ ...settings, background: { mediaId: uploaded.id, blur: 2, opacity: .4, paused: false } });
    await repository.close();
    adapter = (await isolated(name)).adapter;
    expect((await adapter.load()).settings.background.mediaId).toBe(uploaded.id);
    expect((await adapter.mediaContent(uploaded.id)).size).toBe(file.size);
    expect((await adapter.removeMedia(uploaded.id)).background.mediaId).toBe(null);
    await expect(adapter.mediaContent(uploaded.id)).rejects.toThrow();
    await expect(adapter.upload(new File(['unsafe'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow();
    const video = await adapter.upload(new File(['fake bytes'], 'clip.webm', { type: 'video/webm' }));
    expect((await adapter.mediaContent(video.id)).type).toBe('video/webm');
  });
});
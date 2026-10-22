/** 先按视角构造语义邻域，再交给视图布局。次要关系不能抢占主轴的位置或继续递归。 */
import { C, type Concept, type DisplayMode, type GraphSettings, type GraphView, type Participation, type Region } from "./concepts";
import { ConceptIndex } from "./conceptIndex";
import { GRAPH_VIEWS } from "./ontology";
import { displayMode } from "./perspectives";

export interface ProjectedNode { id: string; depth: number; region: Region; priority: number; via: string; emphasis: number }
export interface ProjectedLink {
  id: string; relationId: string; from: string; to: string;
  fromRole: string | null; toRole: string | null; fromLabel: string; toLabel: string;
  region: Region; priority: number; emphasis: number;
  hop: number; label: string; color: number; colorKey: string; colorLabel: string;
}
export interface RelatedRelation { relationId: string; anchors: string[] }
export interface GraphProjection {
  nodes: Map<string, ProjectedNode>; links: ProjectedLink[]; view: GraphView;
  distances: Map<string, number>; omitted: number; budget: number; related: RelatedRelation[];
}
export function relationRule(index: ConceptIndex, relation: Concept, focusRole: string, otherRole: string,
  view: GraphView, settings: GraphSettings): { region: Region; priority: number } {
  const matches = view.rules.filter(r => relation.types.some(t => index.descends(t, r.relationType))
    && (!r.focusRole || index.descends(focusRole, r.focusRole)) && (!r.otherRole || index.descends(otherRole, r.otherRole)));
  matches.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const selected = matches[0];
  if (!selected) throw new Error(`“${relation.label}”没有适用的区域规则`);
  return { region: settings.regionOverrides[selected.id] ?? selected.region, priority: selected.priority };
}
function pathFrom(index: ConceptIndex, id: string, root: string): string[] {
  if (id === root) return [id];
  const candidates = (index.get(id).broader ?? []).filter(p => index.descends(p, root)).sort();
  if (!candidates.length) throw new Error("颜色轴分类路径不完整");
  return [...pathFrom(index, candidates[0], root), id];
}
const fromHex = (hex: string): number => Number.parseInt(hex.slice(1), 16);
function keyColor(key: string): number {
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const colors = [0x507fba, 0x469278, 0xb28639, 0x986cb0, 0x448e96, 0xb16c7c, 0x807d46, 0x647da5];
  return colors[(hash >>> 0) % colors.length];
}
export function relationColor(index: ConceptIndex, relation: Concept, settings: GraphSettings) {
  const typeId = [...relation.types].sort()[0];
  const parent = relation.participants?.find(p => index.descends(p.role, C.parent));
  const child = relation.participants?.find(p => index.descends(p.role, C.child));
  let key: string, label: string, declared: string | undefined;
  if (settings.colorAxis !== "relation" && parent && child) {
    if (settings.colorAxis === "role-pair") {
      const pp = pathFrom(index, parent.role, C.parent), cp = pathFrom(index, child.role, C.child);
      const pr = pp[Math.min(settings.colorDepth, pp.length - 1)];
      const cr = cp[Math.min(Math.max(0, settings.colorDepth - 1), cp.length - 1)];
      key = `pair:${pr}:${cr}`; label = `${index.roleLabel(pr)}—${index.roleLabel(cr)}`;
    } else {
      const p = settings.colorAxis === "parent-role" ? parent : child;
      const path = pathFrom(index, p.role, settings.colorAxis === "parent-role" ? C.parent : C.child);
      const id = path[Math.min(settings.colorDepth, path.length - 1)]; key = id; label = index.roleLabel(id);
    }
  } else {
    const path = pathFrom(index, typeId, index.descends(typeId, C.relation) ? C.relation : C.concept);
    const id = path[Math.min(settings.colorDepth, path.length - 1)];
    key = id; label = index.get(id).label; declared = index.get(id).schema?.color;
    if (settings.colorAxis !== "relation") label += " · 此轴不适用";
  }
  const color = settings.palette[key] ?? declared;
  return { colorKey: key, colorLabel: label, color: color ? fromHex(color) : keyColor(key) };
}

export function projectGraph(index: ConceptIndex, focus: string, settings: GraphSettings, budget = 600,
  revealed: ReadonlySet<string> = new Set()): GraphProjection {
  if (!Number.isInteger(budget) || budget < 2) throw new Error("显示概念预算必须是至少 2 的整数");
  const view = GRAPH_VIEWS.find(v => v.id === settings.viewId);
  if (!view) throw new Error("展示样式不存在");
  index.get(focus);
  const nodes = new Map<string, ProjectedNode>([[focus, { id: focus, depth: 0, region: "right", priority: Infinity, via: focus, emphasis: 1 }]]);
  const distances = new Map<string, number>([[focus, 0]]);
  const queue = [focus], expanded = new Set(settings.expandedRelations);
  const visible = new Map<string, { concept: Concept; emphasis: number }>();
  const deferred = new Map<string, { relation: Concept; anchor: string; depth: number; mode: DisplayMode }>();
  const folded = new Map<string, Set<string>>(), omitted = new Set<string>();
  const structural = new Map<string, { from: string; to: string; region: Region; label: string }>();
  const fold = (r: Concept, anchor: string) => {
    const anchors = folded.get(r.id); if (anchors) anchors.add(anchor); else folded.set(r.id, new Set([anchor]));
  };
  const offer = (id: string, depth: number, region: Region, priority: number, via: string, emphasis: number, traverse: boolean) => {
    if (id === focus) return;
    const old = nodes.get(id);
    if (!old && nodes.size >= budget) { omitted.add(id); return; }
    // 完整主轴先被构建，背景关系只能补充空位，不能重新定位主轴概念。
    if (!old || (emphasis >= old.emphasis && (depth < old.depth || (depth === old.depth && (priority > old.priority || (priority === old.priority && via < old.via)))))) {
      nodes.set(id, { id, depth, region, priority, via, emphasis }); distances.set(id, depth);
      if (traverse && (!old || depth < old.depth)) queue.push(id);
    }
  };
  const expand = (r: Concept, anchor: string, depth: number, mode: DisplayMode, forced = false) => {
    const context = mode !== "main";
    const emphasis = context ? revealed.has(r.id) ? 0.55 : settings.dimOpacity : 1;
    visible.set(r.id, { concept: r, emphasis });
    const ps = r.participants!;
    const mine = ps.filter(p => p.concept === anchor);
    const hub = ps.length !== 2 || expanded.has(r.id) || r.id === focus || nodes.has(r.id);
    for (const p of ps) {
      if (p.concept === anchor) continue;
      const entity = index.get(p.concept);
      const cm = forced || revealed.has(r.id) ? "main" : displayMode(index, entity, "concepts", settings.perspective);
      if (cm === "hidden") continue;
      if (cm === "related") { fold(r, anchor); continue; }
      const rules = mine.map(a => relationRule(index, r, a.role, p.role, view, settings));
      rules.sort((a, b) => b.priority - a.priority);
      const rule = rules[0] ?? { region: p.role === C.source ? "left" as Region : "right" as Region, priority: 70 };
      if (hub && r.id !== focus) offer(r.id, depth, rule.region, rule.priority + (context ? 0 : 10000) - 1, anchor, emphasis, !context);
      offer(p.concept, depth, rule.region, rule.priority + (context ? 0 : 10000), anchor,
        cm === "dim" ? settings.dimOpacity : emphasis, !context && cm === "main");
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], depth = nodes.get(id)!.depth;
    if (depth >= settings.depth) continue;
    const own = index.get(id);
    if (index.isType(own) || index.isRole(own)) {
      const connect = (to: string, region: Region, label: string) => {
        if (to === id) return;
        offer(to, depth + 1, region, 10090, id, 1, true);
        structural.set(`${id}/${label}/${to}`, { from: id, to, region, label });
      };
      for (const parent of own.broader ?? []) connect(parent, "up", "上级分类");
      for (const child of index.subtypes.get(id) ?? []) connect(child.id, "down", "子类");
      for (const instance of index.instances.get(id) ?? []) connect(instance.id, "right", "实例");
      for (const relation of index.byRole.get(id) ?? []) connect(relation.id, "left", "使用此角色");
    }
    if (own.participants) {
      const mode = displayMode(index, own, "relations", settings.perspective);
      if (mode === "main" || id === focus) expand(own, id, depth + 1, id === focus ? "main" : mode, id === focus);
    }
    for (const r of index.relations(id)) {
      const mode = displayMode(index, r, "relations", settings.perspective);
      if (mode === "hidden") continue;
      if (mode !== "main") {
        if (mode === "related") fold(r, id);
        deferred.set(`${r.id}/${id}`, { relation: r, anchor: id, depth: depth + 1, mode });
        continue;
      }
      expand(r, id, depth + 1, mode);
    }
  }
  // 淡显或手动展开的关系只挂在已确定的主轴邻域上，不继续递归扩大画布。
  for (const { relation, anchor, depth, mode } of deferred.values()) {
    if (mode === "dim" || revealed.has(relation.id)) expand(relation, anchor, depth, mode);
  }
  const links: ProjectedLink[] = [];
  const link = (r: Concept, from: string, to: string, a: Participation, b: Participation, suffix: string, emphasis: number, hub = false) => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const rule = relationRule(index, r, a.role, b.role, view, settings);
    const hop = r.id === focus ? 1 : Math.min(...r.participants!.map(p => distances.get(p.concept) ?? Infinity)) + 1;
    links.push({ id: `${r.id}/${suffix}`, relationId: r.id, from, to,
      fromRole: hub ? null : a.role, toRole: b.role, fromLabel: hub ? "" : index.roleLabel(a.role), toLabel: index.roleLabel(b.role),
      ...rule, emphasis, hop: Math.max(1, Math.min(settings.depth, hop)), label: index.typeLabel(r), ...relationColor(index, r, settings) });
  };
  for (const { concept: r, emphasis } of visible.values()) {
    const ps = r.participants!;
    if (nodes.has(r.id)) {
      for (const p of ps) link(r, r.id, p.concept, ps.find(o => o.id !== p.id) ?? p, p, p.id, emphasis, true);
    } else if (ps.length === 2) link(r, ps[0].concept, ps[1].concept, ps[0], ps[1], "binary", emphasis);
  }
  for (const [id, edge] of structural) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    const typeId = index.get(edge.to).types[0], color = index.get(typeId).schema?.color ?? "#6e8ca6";
    links.push({ id, relationId: edge.to, ...edge, fromRole: null, toRole: null, fromLabel: "", toLabel: "",
      priority: 90, emphasis: 1, hop: Math.min(distances.get(edge.from)!, distances.get(edge.to)!) + 1,
      color: fromHex(color), colorKey: typeId, colorLabel: index.get(typeId).label });
  }
  return { nodes, links, view, distances, omitted: omitted.size, budget,
    related: [...folded].map(([relationId, anchors]) => ({ relationId, anchors: [...anchors] })) };
}

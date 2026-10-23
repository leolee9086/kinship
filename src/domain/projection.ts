/** 先按视角构造语义邻域，再交给视图布局。次要关系不能抢占主轴的位置或继续递归。 */
import { C, type Concept, type DisplayMode, type GraphSettings, type GraphView, type Participation, type Region } from "./concepts";
import { ConceptIndex } from "./conceptIndex";
import { displayMode } from "./perspectives";
import { explorationExclusions } from "./lifecycle";

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
/** 自定义角色可以有自己的根；多继承按 UUID 选择确定路径，不寻找某个领域角色。 */
function classificationPath(index: ConceptIndex, id: string): string[] {
  const parent = [...(index.get(id).broader ?? [])].sort()[0];
  return parent ? [...classificationPath(index, parent), id] : [id];
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
  const first = relation.participants?.[0], second = relation.participants?.[1];
  let key: string, label: string, declared: string | undefined;
  if (settings.colorAxis !== "relation" && first && second) {
    const roleAtDepth = (roleId: string) => {
      const path = classificationPath(index, roleId);
      return path[Math.min(settings.colorDepth, path.length - 1)];
    };
    if (settings.colorAxis === "role-pair") {
      const firstId = roleAtDepth(first.role), secondId = roleAtDepth(second.role);
      key = `pair:${firstId}:${secondId}`; label = `${index.roleLabel(firstId)}—${index.roleLabel(secondId)}`;
    } else {
      const id = roleAtDepth(settings.colorAxis === "first-role" ? first.role : second.role);
      key = id; label = index.roleLabel(id); declared = index.get(id).schema?.color;
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
  const view = settings.views.find(v => v.id === settings.viewId);
  if (!view) throw new Error("展示样式不存在");
  index.get(focus);
  const nodes = new Map<string, ProjectedNode>([[focus, { id: focus, depth: 0, region: "right", priority: Infinity, via: focus, emphasis: 1 }]]);
  const distances = new Map<string, number>([[focus, 0]]);
  const excluded = explorationExclusions(index);
  // 从已遗忘目录或保留引用明确打开时，焦点自身可见；不展开其被收起的邻域。
  if (excluded.has(focus)) return { nodes, links: [], view, distances, omitted: 0, budget, related: [] };
  const queue = [focus], expanded = new Set(settings.expandedRelations);
  const visible = new Map<string, { concept: Concept; emphasis: number }>();
  const deferred = new Map<string, { relation: Concept; anchor: string; depth: number; mode: DisplayMode }>();
  const folded = new Map<string, Set<string>>(), omitted = new Set<string>();
  const structural = new Map<string, { from: string; to: string; region: Region; label: string }>();
  const fold = (r: Concept, anchor: string) => {
    const anchors = folded.get(r.id); if (anchors) anchors.add(anchor); else folded.set(r.id, new Set([anchor]));
  };
  const offer = (id: string, depth: number, region: Region, priority: number, via: string, emphasis: number, traverse: boolean) => {
    if (id === focus || excluded.has(id)) return;
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
      // 关系自身作为焦点时也使用保存的角色规则；由其余参与槽提供配对语境。
      const anchors = mine.length ? mine : ps.filter(slot => slot.id !== p.id);
      const rules = anchors.map(a => relationRule(index, r, a.role, p.role, view, settings));
      rules.sort((a, b) => b.priority - a.priority);
      const rule = rules[0];
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
      if (excluded.has(r.id)) continue;
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

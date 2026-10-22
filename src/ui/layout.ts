/**
 * 文本感知的 Plex 布局。
 *
 * 这不是对 TheBrain 内部算法的断言。这里实现的可验证约束是：
 * - 节点以真实文字框排布，不把姓名硬塞在等距圆环上；
 * - 同层子树按轮廓紧凑排开，一级邻居沿浅弧带展开；
 * - 图的连接类型独立于它被排在哪个区域；共享祖先/多家庭不丢边；
 * - 深度是明确的视图 LOD，没有每支只取前 N 人的隐式截断。
 */
import type { Family, NodeId } from "../domain/types";
import { UNIT_PX, nodeBox, BoxIndex, type MeasureNode, type NodeSize } from "./graphGeometry";

export type Zone = "center" | "parent" | "child" | "sibling" | "jump";
export type RelationKind = "parent" | "child" | "sibling" | "spouse";
export interface Placed extends NodeSize {
  x: number;
  y: number;
  a: number;
  r: number;
  zone: Zone;
  depth: number;
  /** 保留给旧坐标工具；新渲染以整个文字框的中心定位。 */
  labelSide: "left" | "right";
  labelW: number;
}
export interface LayoutLink {
  id: string;
  from: NodeId;
  to: NodeId;
  kind: RelationKind;
  /** 显示区域不用于决定关系颜色。 */
  zone: Zone;
  depth: number;
  /** 从焦点沿真实连接到这条边的最短跳数，焦点直接边为 1。 */
  hop: number;
  familyIds: NodeId[];
  primary: boolean;
}
export interface LayoutResult {
  positions: Map<NodeId, Placed>;
  center: NodeId;
  links: LayoutLink[];
}

const pairKey = (a: NodeId, b: NodeId) => JSON.stringify([a, b]);
const unorderedKey = (a: NodeId, b: NodeId) => pairKey(...([a, b].sort() as [NodeId, NodeId]));

/** 用 Set 建索引；一个家庭有数万子女时也不做 includes 的平方次查找。 */
export function buildIndex(families: Family[]) {
  const parents = new Map<NodeId, Set<NodeId>>();
  const children = new Map<NodeId, Set<NodeId>>();
  const spouses = new Map<NodeId, Set<NodeId>>();
  const parentFamilies = new Map<string, Set<NodeId>>();
  const spouseFamilies = new Map<string, Set<NodeId>>();
  const add = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(value);
  };
  for (const f of families) {
    const elders = [...new Set([f.father, f.mother].filter((id): id is NodeId => !!id))];
    for (const child of new Set(f.children)) {
      for (const parent of elders) {
        if (parent === child) continue;
        add(parents, child, parent);
        add(children, parent, child);
        add(parentFamilies, pairKey(parent, child), f.id);
      }
    }
    if (elders.length === 2) {
      add(spouses, elders[0], elders[1]);
      add(spouses, elders[1], elders[0]);
      add(spouseFamilies, unorderedKey(elders[0], elders[1]), f.id);
    }
  }
  const arrays = <K, V>(m: Map<K, Set<V>>) => new Map([...m].map(([key, set]) => [key, [...set]]));
  return {
    families,
    parentsOf: arrays(parents), childrenOf: arrays(children), spousesOf: arrays(spouses),
    parentFamilies: arrays(parentFamilies), spouseFamilies: arrays(spouseFamilies),
  };
}
export type RelationIndex = ReturnType<typeof buildIndex>;

export function siblingsOfOne(index: RelationIndex, id: NodeId): NodeId[] {
  const out = new Set<NodeId>();
  for (const p of index.parentsOf.get(id) ?? []) {
    for (const c of index.childrenOf.get(p) ?? []) if (c !== id) out.add(c);
  }
  return [...out];
}

export interface PlexOptions {
  depth: number;
  /** 文字框之间的空隙（世界像素）。 */
  gap: number;
  levelGap: number;
  /** 浅弧带的最大弯幅，不是圆环半径。 */
  bow: number;
  /** 焦点与左侧跳跃/配偶文字框的基准边缘间距，单位为世界像素。 */
  jumpGap: number;
}
export const DEFAULT_PLEX: PlexOptions = { depth: 2, gap: 26, levelGap: 90, bow: 48, jumpGap: 64 };

interface ViewNode extends NodeSize {
  id: NodeId;
  zone: Exclude<Zone, "center">;
  depth: number;
  owner: NodeId;
  children: ViewNode[];
  /** tidy 轮廓算法算出的切向坐标（像素）。 */
  u: number;
}
interface Contour { low: number[]; high: number[]; nodes: ViewNode[] }

/**
 * 合并子树的每层左右轮廓，避免仅按叶子数分角时长姓名互相压叠。
 * 数据只走当前邻域，复杂度约 O(可见节点 × 展开深度)。
 */
function tidyForest(roots: ViewNode[], vertical: boolean, gap: number): ViewNode[] {
  const tangent = (n: ViewNode) => vertical ? n.width : n.height;
  const combine = (trees: Contour[]): Contour => {
    const result: Contour = { low: [], high: [], nodes: [] };
    for (const tree of trees) {
      let shift = 0;
      for (let d = 0; d < tree.low.length; d++) {
        if (result.high[d] !== undefined) shift = Math.max(shift, result.high[d] + gap - tree.low[d]);
      }
      for (const n of tree.nodes) { n.u += shift; result.nodes.push(n); }
      for (let d = 0; d < tree.low.length; d++) {
        result.low[d] = Math.min(result.low[d] ?? Infinity, tree.low[d] + shift);
        result.high[d] = Math.max(result.high[d] ?? -Infinity, tree.high[d] + shift);
      }
    }
    return result;
  };
  const visit = (node: ViewNode): Contour => {
    const child = combine(node.children.map(visit));
    const center = node.children.length
      ? (node.children[0].u + node.children[node.children.length - 1].u) / 2 : 0;
    for (const n of child.nodes) n.u -= center;
    node.u = 0;
    return {
      low: [-tangent(node) / 2, ...child.low.map(x => x - center)],
      high: [tangent(node) / 2, ...child.high.map(x => x - center)],
      nodes: [node, ...child.nodes],
    };
  };
  const packed = combine(roots.map(visit));
  if (!roots.length) return [];
  const center = (packed.low[0] + packed.high[0]) / 2;
  for (const n of packed.nodes) n.u -= center;
  return packed.nodes;
}

export function plexLayout(
  focus: NodeId,
  index: RelationIndex,
  measure: MeasureNode,
  opts: PlexOptions = DEFAULT_PLEX,
): LayoutResult {
  const positions = new Map<NodeId, Placed>();
  const focusSize = measure(focus, true);
  positions.set(focus, {
    ...focusSize, x: 0, y: 0, a: 0, r: 0, depth: 0, zone: "center",
    labelSide: "right", labelW: focusSize.width / UNIT_PX,
  });
  const groups = new Map<Exclude<Zone, "center">, ViewNode[]>();
  const view = new Map<NodeId, ViewNode>();
  const direct: Array<[Exclude<Zone, "center">, NodeId[]]> = [
    ["parent", index.parentsOf.get(focus) ?? []],
    ["child", index.childrenOf.get(focus) ?? []],
    ["sibling", siblingsOfOne(index, focus)],
    ["jump", index.spousesOf.get(focus) ?? []],
  ];
  // 先保留所有一级邻居，再扩展外圈。DFS 会先把兄弟/配偶当外圈“占走”。
  for (const [zone, ids] of direct) {
    const roots: ViewNode[] = [];
    for (const id of ids) {
      if (id === focus || view.has(id)) continue;
      const node: ViewNode = { ...measure(id, false), id, zone, depth: 1, owner: focus, children: [], u: 0 };
      roots.push(node); view.set(id, node);
    }
    groups.set(zone, roots);
  }
  const queue = [...view.values()];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (n.depth >= opts.depth || n.zone === "jump") continue;
    const next = n.zone === "parent" ? index.parentsOf.get(n.id) : index.childrenOf.get(n.id);
    for (const id of next ?? []) {
      if (id === focus || view.has(id)) continue;
      const child: ViewNode = {
        ...measure(id, false), id, zone: n.zone, depth: n.depth + 1,
        owner: n.id, children: [], u: 0,
      };
      n.children.push(child); view.set(id, child); queue.push(child);
    }
  }

  const occupied = new BoxIndex(128 / UNIT_PX);
  occupied.add(nodeBox(positions.get(focus)!, opts.gap / UNIT_PX / 2));
  const put = (n: ViewNode, px: number, py: number) => {
    const x = px / UNIT_PX, y = py / UNIT_PX;
    const p: Placed = { width: n.width, height: n.height, zone: n.zone, depth: n.depth,
      x, y, a: Math.atan2(y, x), r: Math.hypot(x, y), labelSide: x < 0 ? "left" : "right", labelW: n.width / UNIT_PX };
    positions.set(n.id, p);
    occupied.add(nodeBox(p, opts.gap / UNIT_PX / 2));
  };
  const placeGroup = (zone: Exclude<Zone, "center">, base = 0) => {
    const vertical = zone === "parent" || zone === "child";
    const roots = groups.get(zone) ?? [];
    const nodes = tidyForest(roots, vertical, vertical ? opts.gap : 18);
    const sign = zone === "parent" || zone === "jump" ? -1 : 1;
    let outer = 0;
    if (vertical) {
      // 一级是两翼的文本行，不用后代叶子数把九个孩子拉成三千像素的一排。
      // 每翼依自己的姓名高度排开；横向距离按姓名宽度，弯幅随行号平滑变化。
      const wingCount = Math.ceil(roots.length / 2);
      const cursor = [focusSize.height / 2 + opts.levelGap, focusSize.height / 2 + opts.levelGap];
      for (let i = 0; i < roots.length; i++) {
        const n = roots[i], wing = i % 2, row = Math.floor(i / 2);
        const t = wingCount <= 1 ? 0.5 : row / (wingCount - 1);
        const side = wing === 0 ? -1 : 1;
        const px = roots.length === 1 ? 0
          : side * (focusSize.width / 2 + n.width / 2 + opts.gap + opts.bow * Math.sin(Math.PI * t));
        const py = cursor[wing] + n.height / 2;
        cursor[wing] += n.height + opts.gap;
        put(n, px, sign * py);
        outer = Math.max(outer, py + n.height / 2);
      }
    } else {
      // 兄弟/配偶是侧面的竖向扇束，文本始终水平。
      const totalHeight = roots.reduce((s, n) => s + n.height, 0) + Math.max(0, roots.length - 1) * 18;
      let cursor = -totalHeight / 2;
      for (let i = 0; i < roots.length; i++) {
        const n = roots[i];
        const t = roots.length <= 1 ? 0.5 : i / (roots.length - 1);
        const bow = roots.length > 1 ? opts.bow * Math.sin(Math.PI * t) : 0;
        let px = zone === "jump"
          ? focusSize.width / 2 + n.width / 2 + opts.jumpGap + bow
          : base + focusSize.width / 2 + n.width / 2 + opts.levelGap + bow;
        const py = cursor + n.height / 2;
        if (zone === "jump") {
          // 基准距离只因真实文字框冲突才增大，不拿整个上下文的包围盒把配偶推远。
          while (true) {
            const candidate = nodeBox({ x: -px / UNIT_PX, y: py / UNIT_PX, width: n.width, height: n.height }, opts.gap / UNIT_PX / 2);
            const collisions = occupied.query(candidate);
            if (!collisions.length) break;
            px = -Math.min(...collisions.map(b => b.left)) * UNIT_PX + n.width / 2 + opts.gap / 2 + 1;
          }
        }
        put(n, sign * px, py);
        cursor += n.height + 18;
        outer = Math.max(outer, px + n.width / 2);
      }
    }
    // 外圈只是上下文。它单独排在一级文字带以外，不反过来拉散一级布局。
    let previous = outer;
    for (let depth = 2; depth <= opts.depth; depth++) {
      const layer = nodes.filter(n => n.depth === depth);
      if (!layer.length) continue;
      const half = Math.max(...layer.map(n => vertical ? n.height : n.width)) / 2;
      const normal = previous + opts.levelGap + half;
      for (const n of layer) {
        const bow = opts.bow * 0.35 / (1 + Math.abs(n.u) / 400);
        put(n, vertical ? n.u : sign * (normal + bow), vertical ? sign * (normal + bow) : n.u);
      }
      previous = normal + half + opts.bow * 0.35;
    }
  };
  placeGroup("parent"); placeGroup("child");
  // 侧向一级避开上下的一级文字带，不能被很宽的远景上下文推到几千像素外。
  let left = -focusSize.width / 2, right = focusSize.width / 2;
  for (const p of positions.values()) {
    if (p.depth > 1) continue;
    const b = nodeBox(p); left = Math.min(left, b.left * UNIT_PX); right = Math.max(right, b.right * UNIT_PX);
  }
  placeGroup("sibling", Math.max(0, right - focusSize.width / 2) + 24);
  placeGroup("jump", Math.max(0, -left - focusSize.width / 2) + 24);

  // 遍历可见点的真实邻接表，补全跨支连接。绝不按角度/距离猜父子。
  const links: LayoutLink[] = [];
  const emitted = new Set<string>();
  const addLink = (from: NodeId, to: NodeId, kind: RelationKind, familyIds: NodeId[]) => {
    const id = `${kind}:${pairKey(from, to)}`;
    if (emitted.has(id)) return;
    emitted.add(id);
    const a = positions.get(from)!, b = positions.get(to)!;
    links.push({
      id, from, to, kind, familyIds, depth: Math.max(a.depth, b.depth), hop: 0,
      zone: kind === "spouse" ? "jump" : kind,
      primary: from === focus || to === focus || view.get(to)?.owner === from || view.get(from)?.owner === to,
    });
  };
  for (const [id, p] of positions) {
    for (const parent of index.parentsOf.get(id) ?? []) {
      const pp = positions.get(parent);
      if (!pp) continue;
      const families = index.parentFamilies.get(pairKey(parent, id));
      if (!families) throw new Error("亲子索引缺少家庭出处");
      if (p.depth < pp.depth) addLink(id, parent, "parent", families);
      else addLink(parent, id, "child", families);
    }
    for (const spouse of index.spousesOf.get(id) ?? []) {
      if (!positions.has(spouse) || id > spouse) continue;
      const families = index.spouseFamilies.get(unorderedKey(id, spouse));
      if (!families) throw new Error("配偶索引缺少家庭出处");
      // 焦点连接从焦点出发，其他配偶连接用稳定 ID 次序。
      addLink(spouse === focus ? spouse : id, spouse === focus ? id : spouse, "spouse", families);
    }
  }
  for (const sibling of direct.find(([z]) => z === "sibling")![1]) {
    if (!positions.has(sibling)) continue;
    const families = new Set<NodeId>();
    for (const parent of index.parentsOf.get(focus) ?? []) {
      if (!(index.parentsOf.get(sibling) ?? []).includes(parent)) continue;
      for (const id of index.parentFamilies.get(pairKey(parent, sibling)) ?? []) families.add(id);
    }
    addLink(focus, sibling, "sibling", [...families]);
  }
  // 跳数按最终真实连接图做 BFS。不能用绘制区域/建树深度冒充关系距离；
  // 例如两个父母间的配偶线虽然两端都在一级，边本身仍然是第 2 跳。
  const adjacent = new Map<NodeId, NodeId[]>();
  for (const link of links) {
    for (const [a, b] of [[link.from, link.to], [link.to, link.from]]) {
      let list = adjacent.get(a); if (!list) { list = []; adjacent.set(a, list); }
      list.push(b);
    }
  }
  const distance = new Map<NodeId, number>([[focus, 0]]);
  const bfs = [focus];
  for (let i = 0; i < bfs.length; i++) {
    const id = bfs[i];
    for (const next of adjacent.get(id) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(id)! + 1); bfs.push(next);
    }
  }
  for (const link of links) {
    const a = distance.get(link.from), b = distance.get(link.to);
    if (a === undefined || b === undefined) throw new Error(`关系子图与焦点断开：${link.id}`);
    link.hop = Math.min(a, b) + 1;
  }
  return { positions, center: focus, links };
}

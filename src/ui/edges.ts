/** 语义规则指定端口；同一对概念的多条关系拥有独立通道与关系 UUID。 */
import type { ProjectedLink } from "../domain/projection";
import type { ConceptPlacement } from "./conceptLayout";
import { gate, gateNormal, nodeBox, overlaps, UNIT_PX, type PortName, type Box, type Point } from "./graphGeometry";

export interface Curve extends ProjectedLink {
  x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number;
  fromPort: PortName; toPort: PortName; lane: number;
  /** 动画中两个文字框重叠时，暂不画无法从框外连接的线。 */
  blocked: boolean;
}
export interface CurveStyle { type: "bezier" | "straight"; curvature: number }
export const DEFAULT_CURVE: CurveStyle = { type: "bezier", curvature: 0.52 };
export const edgeOpacity = (hop: number): number => {
  if (!Number.isInteger(hop) || hop < 1) throw new Error("无效的语义跳数");
  return 0.86 * 0.46 ** (hop - 1);
};
const ports = { up: "parent", down: "child", left: "left", right: "right" } as const;
const opposite: Record<PortName, PortName> = { parent: "child", child: "parent", left: "right", right: "left" };

export function buildCurves(positions: Map<string, ConceptPlacement>, links: ProjectedLink[], style = DEFAULT_CURVE): Curve[] {
  const groups = new Map<string, ProjectedLink[]>();
  for (const l of links) {
    const key = [l.from, l.to].sort().join("/");
    const group = groups.get(key); if (group) group.push(l); else groups.set(key, [l]);
  }
  const lanes = new Map<string, number>();
  for (const group of groups.values()) group.sort((a, b) => a.id.localeCompare(b.id)).forEach((l, i) => {
    lanes.set(l.id, (i - (group.length - 1) / 2) * 0.2);
  });
  return links.map(link => {
    const a = positions.get(link.from), b = positions.get(link.to);
    if (!a || !b) throw new Error("关系投影缺少可见端点");
    return routeCurve(a, b, { ...link, lane: lanes.get(link.id)! }, style);
  });
}

export function routeCurve(a: Pick<ConceptPlacement, "x" | "y" | "width" | "height">,
  b: Pick<ConceptPlacement, "x" | "y" | "width" | "height">,
  link: ProjectedLink & { lane: number; fromPort?: PortName; toPort?: PortName }, style = DEFAULT_CURVE): Curve {
  const ab = nodeBox(a), bb = nodeBox(b);
  const available: PortName[] = [];
  if (bb.left >= ab.right) available.push("right");
  if (bb.right <= ab.left) available.push("left");
  if (bb.top >= ab.bottom) available.push("child");
  if (bb.bottom <= ab.top) available.push("parent");
  // 关系的阅读方向与参与槽的录入端序不同。只在几何上可朝向目标时使用语义提示。
  // 尤其配偶/同僚等对称关系，不能把“对方在左侧”硬编码成 UUID 端序的左端口。
  const hint = ports[link.region];
  const geometric: PortName = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
    ? b.x >= a.x ? "right" : "left" : b.y >= a.y ? "child" : "parent";
  const fromPort = available.includes(hint) ? hint : available.includes(geometric) ? geometric : available[0] ?? geometric;
  const toPort = opposite[fromPort];
  const start = gate(a, fromPort), end = gate(b, toPort);
  const n1 = gateNormal(fromPort), n2 = gateNormal(toPort);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const gap = Math.abs(n1.x ? end.x - start.x : end.y - start.y);
  // 控制点沿分离轴单调推进，整段曲线位于两个文字框之间，不会出右口再绕回穿框。
  const handle = style.type === "straight" ? 0 : Math.min(gap * 0.45, Math.max(0.18, distance * style.curvature));
  const lane = link.lane * (link.from < link.to ? 1 : -1);
  const tangent = { x: -n1.y, y: n1.x };
  const faceLimit = Math.min(n1.x ? a.height : a.width, n1.x ? b.height : b.width) / UNIT_PX * 0.22;
  const offset = Math.max(-faceLimit, Math.min(faceLimit, lane * 0.15));
  return { ...link, fromPort, toPort, blocked: overlaps(ab, bb),
    x1: start.x + tangent.x * offset, y1: start.y + tangent.y * offset,
    c1x: start.x + n1.x * handle + tangent.x * lane, c1y: start.y + n1.y * handle + tangent.y * lane,
    c2x: end.x + n2.x * handle + tangent.x * lane, c2y: end.y + n2.y * handle + tangent.y * lane,
    x2: end.x + tangent.x * offset, y2: end.y + tangent.y * offset };
}
export function cubicPoint(c: Curve, t: number): Point {
  const s = 1 - t;
  return { x: s ** 3 * c.x1 + 3 * s * s * t * c.c1x + 3 * s * t * t * c.c2x + t ** 3 * c.x2,
    y: s ** 3 * c.y1 + 3 * s * s * t * c.c1y + 3 * s * t * t * c.c2y + t ** 3 * c.y2 };
}
export function curveBounds(c: Curve): Box {
  const extrema = (p0: number, p1: number, p2: number, p3: number) => {
    const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), d = p1 - p0;
    if (Math.abs(a) < 1e-10) return Math.abs(b) < 1e-10 ? [] : [-d / b];
    const discriminant = b * b - 4 * a * d;
    if (discriminant < 0) return [];
    return [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
  };
  let left = Math.min(c.x1, c.x2), right = Math.max(c.x1, c.x2);
  let top = Math.min(c.y1, c.y2), bottom = Math.max(c.y1, c.y2);
  for (const t of [...extrema(c.x1, c.c1x, c.c2x, c.x2), ...extrema(c.y1, c.c1y, c.c2y, c.y2)]) {
    if (t <= 0 || t >= 1) continue;
    const p = cubicPoint(c, t); left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  return { left, right, top, bottom };
}
export function curveInViewport(c: Curve, view: Box, padding = 0): boolean {
  if (c.blocked) return false;
  const b = curveBounds(c);
  return b.right >= view.left - padding && b.left <= view.right + padding
    && b.bottom >= view.top - padding && b.top <= view.bottom + padding;
}

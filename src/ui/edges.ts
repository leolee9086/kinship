/** 关系语义、门的位置、曲线样式相互独立；动态端点也走这套路由。 */
import type { NodeId } from "../domain/types";
import type { Placed, LayoutLink, RelationKind } from "./layout";
import { gate, gateNormal, type PortName, type Box, type Point } from "./graphGeometry";

export interface Curve extends LayoutLink {
  x1: number; y1: number;
  c1x: number; c1y: number;
  c2x: number; c2y: number;
  x2: number; y2: number;
  fromPort: PortName;
  toPort: PortName;
}
export interface CurveStyle {
  type: "bezier" | "straight";
  curvature: number;
}
export const DEFAULT_CURVE: CurveStyle = { type: "bezier", curvature: 0.52 };

/** 只按连接种类赋色，外圈后代也不会因为排在兄弟区就变成兄弟色。 */
export const RELATION_COLORS: Record<RelationKind, number> = {
  parent: 0x527fbd,
  child: 0x36996d,
  sibling: 0xb0862e,
  spouse: 0x9c6db0,
};
export const RELATION_LABELS: Record<RelationKind, string> = {
  parent: "父母", child: "子女", sibling: "兄弟姐妹", spouse: "配偶",
};

/** 直接关系清晰；其余连接按最短跳数指数衰减，不按布局区域二分。 */
export function edgeOpacity(hop: number): number {
  if (!Number.isInteger(hop) || hop < 1) throw new Error(`无效关系跳数：${hop}`);
  return 0.86 * Math.pow(0.46, hop - 1);
}

export function buildCurves(
  positions: Map<NodeId, Placed>, links: LayoutLink[], style: CurveStyle = DEFAULT_CURVE,
): Curve[] {
  return links.map(link => {
    const a = positions.get(link.from), b = positions.get(link.to);
    if (!a || !b) throw new Error(`连线端点缺失：${link.id}`);
    return routeCurve(a, b, link, style);
  });
}

/**
 * 线从语义门出发，控制点沿门的法线延展。
 * 一级子女共享出门切线，但终点的切线依附于各自文字框，形成平滑束扇。
 * 不再沿“圆心→节点”同一条直线放两个控制点。
 */
export function routeCurve(
  a: Pick<Placed, "x" | "y" | "width" | "height">,
  b: Pick<Placed, "x" | "y" | "width" | "height">,
  link: LayoutLink,
  style: CurveStyle = DEFAULT_CURVE,
): Curve {
  let fromPort: PortName, toPort: PortName;
  if (link.kind === "parent") { fromPort = "parent"; toPort = "child"; }
  else if (link.kind === "child") { fromPort = "child"; toPort = "parent"; }
  else {
    const right = b.x >= a.x;
    fromPort = right ? "right" : "left";
    toPort = right ? "left" : "right";
  }
  // 一级纵向关系也可以从对方朝向中央的侧门接入；这样长扇束能沿文字行间的
  // 中央通道展开，不必斜穿上面的姓名框。关系类型仍由 link.kind 决定。
  const verticalPrimary = link.depth === 1 && (link.kind === "parent" || link.kind === "child");
  if (verticalPrimary && Math.abs(b.x - a.x) > 0.4) toPort = b.x > a.x ? "left" : "right";
  // 场景传回目标曲线时沿用已选好的门，过渡经过中心时不能突然换门。
  const assigned = link as LayoutLink & Partial<Pick<Curve, "fromPort" | "toPort">>;
  if (assigned.fromPort && assigned.toPort) { fromPort = assigned.fromPort; toPort = assigned.toPort; }
  const start = gate(a, fromPort), end = gate(b, toPort);
  const n1 = gateNormal(fromPort), n2 = gateNormal(toPort);
  const dx = Math.abs(end.x - start.x), dy = Math.abs(end.y - start.y);
  const vertical = fromPort === "parent" || fromPort === "child";
  const along = vertical ? dy : dx;
  const across = vertical ? dx : dy;
  // 同门出发的远端曲线弯得稍多，近端保持紧凑。句柄始终朝文字框外。
  const handle = style.type === "straight" ? 0
    : Math.max(0.16, Math.min(1.4, along * style.curvature + across * 0.12));
  const sideArrival = verticalPrimary && (toPort === "left" || toPort === "right");
  const departure = sideArrival && style.type !== "straight" ? Math.max(0.18, along * 0.82) : handle;
  const arrival = sideArrival && style.type !== "straight" ? Math.max(0.12, across * 0.44) : handle;
  return {
    ...link, fromPort, toPort,
    x1: start.x, y1: start.y,
    c1x: start.x + n1.x * departure, c1y: start.y + n1.y * departure,
    c2x: end.x + n2.x * arrival, c2y: end.y + n2.y * arrival,
    x2: end.x, y2: end.y,
  };
}

export function cubicPoint(c: Curve, t: number): Point {
  const s = 1 - t;
  return {
    x: s ** 3 * c.x1 + 3 * s * s * t * c.c1x + 3 * s * t * t * c.c2x + t ** 3 * c.x2,
    y: s ** 3 * c.y1 + 3 * s * s * t * c.c1y + 3 * s * t * t * c.c2y + t ** 3 * c.y2,
  };
}

/** 取导数的零点，求整条三次曲线的真实 AABB，不用端点是否可见代替曲线裁剪。 */
export function curveBounds(c: Curve): Box {
  const extrema = (p0: number, p1: number, p2: number, p3: number) => {
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const d = p1 - p0;
    if (Math.abs(a) < 1e-10) return Math.abs(b) < 1e-10 ? [] : [-d / b];
    const discriminant = b * b - 4 * a * d;
    if (discriminant < 0) return [];
    const root = Math.sqrt(discriminant);
    return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  };
  let left = Math.min(c.x1, c.x2), right = Math.max(c.x1, c.x2);
  let top = Math.min(c.y1, c.y2), bottom = Math.max(c.y1, c.y2);
  for (const t of [...extrema(c.x1, c.c1x, c.c2x, c.x2), ...extrema(c.y1, c.c1y, c.c2y, c.y2)]) {
    if (t <= 0 || t >= 1) continue;
    const p = cubicPoint(c, t);
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  return { left, right, top, bottom };
}

/** 保守相交：允许少量多画，不能漏掉穿过视口而两端都在外面的曲线。 */
export function curveInViewport(c: Curve, view: Box, padding = 0): boolean {
  const b = curveBounds(c);
  return b.right >= view.left - padding && b.left <= view.right + padding
    && b.bottom >= view.top - padding && b.top <= view.bottom + padding;
}

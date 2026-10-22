/** 布局与 Pixi 共用的几何契约。长度只在这里从像素换成布局单位。 */
export const UNIT_PX = 190;
export const GRAPH_FONT = "system-ui, -apple-system, Segoe UI, Microsoft YaHei, sans-serif";
export const NAME_PX = 14;
export const DATE_PX = 11;
export const NODE_PAD = 12;
export const ICON_SPACE = 15;

export interface NodeSize {
  /** 世界像素；包括姓名、生卒年、图标与内边距。 */
  width: number;
  height: number;
}

export interface NodeLabel {
  label: string;
  sub?: string;
}

export type MeasureNode = (id: string, isFocus: boolean) => NodeSize;
export interface Point { x: number; y: number }
export interface Box { left: number; top: number; right: number; bottom: number }

/** 真正用浏览器字体测量；布局不再用字符数 / 100 猜一个与渲染不一致的宽度。 */
export function createTextMeasurer(): (text: NodeLabel, isFocus: boolean) => NodeSize {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("无法创建姓名测量画布");
  const cache = new Map<string, NodeSize>();
  return ({ label, sub }, isFocus) => {
    const key = JSON.stringify([label, sub, isFocus]);
    const cached = cache.get(key);
    if (cached) return cached;
    context.font = `${isFocus ? 600 : 400} ${NAME_PX}px ${GRAPH_FONT}`;
    const nameWidth = context.measureText(label).width;
    context.font = `400 ${DATE_PX}px ${GRAPH_FONT}`;
    const dateWidth = sub ? context.measureText(sub).width : 0;
    const size = {
      width: Math.ceil(Math.max(nameWidth, dateWidth)) + NODE_PAD * 2 + ICON_SPACE,
      height: sub ? 44 : 32,
    };
    cache.set(key, size);
    return size;
  };
}

export function nodeBox(p: Point & NodeSize, padding = 0): Box {
  const halfW = p.width / UNIT_PX / 2 + padding;
  const halfH = p.height / UNIT_PX / 2 + padding;
  return { left: p.x - halfW, right: p.x + halfW, top: p.y - halfH, bottom: p.y + halfH };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** 文字避让用的稀疏网格；只查询附近的框，不做每帧全图平方次碰撞。 */
export class BoxIndex {
  private cells = new Map<string, Set<Box>>();
  constructor(private cellSize: number) {}
  private keys(box: Box): string[] {
    const out: string[] = [];
    for (let x = Math.floor(box.left / this.cellSize); x <= Math.floor(box.right / this.cellSize); x++) {
      for (let y = Math.floor(box.top / this.cellSize); y <= Math.floor(box.bottom / this.cellSize); y++) out.push(`${x},${y}`);
    }
    return out;
  }
  add(box: Box) {
    for (const key of this.keys(box)) {
      let cell = this.cells.get(key); if (!cell) { cell = new Set(); this.cells.set(key, cell); }
      cell.add(box);
    }
  }
  query(box: Box): Box[] {
    const out = new Set<Box>();
    for (const key of this.keys(box)) for (const candidate of this.cells.get(key) ?? []) {
      if (overlaps(box, candidate)) out.add(candidate);
    }
    return [...out];
  }
}

export type PortName = "parent" | "child" | "left" | "right";

/** 门的位置依附于文字框，不依附于原点/圆环；动画期间也用同一个函数。 */
export function gate(p: Point & NodeSize, name: PortName): Point {
  const hw = p.width / UNIT_PX / 2;
  const hh = p.height / UNIT_PX / 2;
  switch (name) {
    case "parent": return { x: p.x - hw * 0.35, y: p.y - hh };
    case "child": return { x: p.x + hw * 0.35, y: p.y + hh };
    case "left": return { x: p.x - hw, y: p.y };
    case "right": return { x: p.x + hw, y: p.y };
  }
}

export function gateNormal(name: PortName): Point {
  switch (name) {
    case "parent": return { x: 0, y: -1 };
    case "child": return { x: 0, y: 1 };
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
  }
}

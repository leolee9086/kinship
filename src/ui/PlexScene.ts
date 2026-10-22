/** Pixi 场景生命周期与动画。React 不逐帧 setState，也不在聚焦时销毁整个场景。 */
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { PixiGraphProps, PixiNode, Camera } from "./PixiGraph";
import type { Curve } from "./edges";
import { routeCurve, RELATION_COLORS, RELATION_LABELS, cubicPoint, curveInViewport, edgeOpacity } from "./edges";
import { UNIT_PX, GRAPH_FONT, NAME_PX, DATE_PX, gate, BoxIndex, type Box, type PortName } from "./graphGeometry";
import { attachGraphInput } from "./graphInput";

interface Display { box: Container; background: Graphics; name: Text; date: Text | null; signature: string }
interface NodeVisual {
  data: PixiNode;
  x: number; y: number;
  alpha: number; targetAlpha: number;
  dying: boolean; entering: boolean;
  display: Display | null;
}
interface EdgeVisual { data: Curve; alpha: number; targetAlpha: number }
const PORTS: PortName[] = ["parent", "child", "left", "right"];

export class PlexScene {
  private props: PixiGraphProps;
  private world = new Container();
  private lines = new Graphics();
  private labelLayer = new Container();
  private relationLabels = new Map<string, { box: Container; text: Text }>();
  private nodes = new Map<string, NodeVisual>();
  private edges = new Map<string, EdgeVisual>();
  private usedPorts = new Map<string, Map<PortName, number>>();
  private focus: string | null = null;
  private camera: Camera;
  private targetCamera: Camera;
  private lastCameraInput: Camera;
  private width = 0;
  private height = 0;
  private disposed = false;
  private detachInput: () => void;
  private observer: ResizeObserver;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private overview = new Container();
  private mapBase = new Graphics();
  private mapDots = new Graphics();
  private mapView = new Graphics();
  private mapTransform = { x: 0, y: 0, scale: 1 };
  private readonly mapWidth = 144;
  private readonly mapHeight = 92;
  private renderedEdges: Array<Curve & { alpha: number; color: number }> = [];

  constructor(private app: Application, private host: HTMLDivElement, props: PixiGraphProps) {
    this.props = props;
    this.width = host.clientWidth; this.height = host.clientHeight;
    // 首帧就使用真实视口中心，不让 (0,0) 先闪在左上角。
    this.camera = { x: this.width / 2, y: this.height * 0.44, zoom: props.camera.zoom };
    this.targetCamera = { ...this.camera }; this.lastCameraInput = props.camera;
    this.world.eventMode = "none";
    this.app.stage.addChild(this.world);
    this.world.addChild(this.lines, this.labelLayer);
    this.overview.eventMode = "none";
    this.overview.addChild(this.mapBase, this.mapDots, this.mapView);
    this.app.stage.addChild(this.overview);
    this.app.ticker.add(this.tick);
    const canvas = this.app.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "亲属关系图。方向键聚焦亲属，Enter 编辑，滚轮缩放，拖拽平移。");
    this.detachInput = attachGraphInput(canvas, {
      camera: () => this.camera,
      applyCamera: cam => this.publishCamera(cam),
      pick: (x, y) => this.pick(x, y),
      select: id => this.props.onNodeClick(id),
      overview: (x, y) => this.pickOverview(x, y),
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.syncData();
    this.resize();
    props.onCameraChange(this.camera);
    host.dataset.graphReady = "true";
    this.wake();
  }

  update(props: PixiGraphProps) {
    const dataChanged = this.props.nodes !== props.nodes || this.props.curves !== props.curves
      || this.props.level !== props.level || this.props.curveStyle !== props.curveStyle;
    this.props = props;
    if (props.camera !== this.lastCameraInput) {
      this.lastCameraInput = props.camera;
      this.targetCamera = { ...props.camera };
      if (!props.camera.animate || this.reduceMotion.matches) this.camera = { ...props.camera };
    }
    if (dataChanged) this.syncData();
    this.wake();
  }

  private resize() {
    if (this.disposed) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return; // ResizeObserver 会在宿主真正可见时重跑。
    this.width = width; this.height = height;
    this.app.renderer.resize(width, height);
    this.props.onViewportChange(width, height);
    this.overview.position.set(width - this.mapWidth - 14, height - this.mapHeight - 14);
    this.drawOverview();
    this.wake();
  }

  private syncData() {
    const nextFocus = this.props.nodes.find(n => n.isFocus)?.id ?? null;
    const changingFocus = nextFocus !== this.focus;
    const selected = nextFocus ? this.nodes.get(nextFocus) : undefined;
    // 鼠标和键盘共用同一入场原点；不依赖“上一次鼠标点过哪里”。
    const spawn = selected ? { x: selected.x, y: selected.y } : { x: 0, y: 0 };
    const alive = new Set<string>();
    for (const n of this.props.nodes) {
      alive.add(n.id);
      let v = this.nodes.get(n.id);
      if (!v) {
        v = { data: n, x: changingFocus && this.focus ? spawn.x : n.x * UNIT_PX,
          y: changingFocus && this.focus ? spawn.y : n.y * UNIT_PX,
          alpha: 0, targetAlpha: 1, entering: true, dying: false, display: null };
        this.nodes.set(n.id, v);
      }
      v.data = n; v.dying = false;
      v.targetAlpha = n.depth <= 1 ? 1 : 0.58;
    }
    for (const [id, v] of this.nodes) if (!alive.has(id)) { v.dying = true; v.targetAlpha = 0; }
    const edgeIds = new Set<string>();
    this.usedPorts.clear();
    for (const c of this.props.curves) {
      edgeIds.add(c.id);
      const targetAlpha = edgeOpacity(c.hop);
      const v = this.edges.get(c.id);
      if (v) { v.data = c; v.targetAlpha = targetAlpha; }
      else this.edges.set(c.id, { data: c, alpha: 0, targetAlpha });
      for (const [id, port] of [[c.from, c.fromPort], [c.to, c.toPort]] as const) {
        let ports = this.usedPorts.get(id);
        if (!ports) { ports = new Map(); this.usedPorts.set(id, ports); }
        ports.set(port, RELATION_COLORS[c.kind]);
      }
    }
    for (const [id, v] of this.edges) if (!edgeIds.has(id)) v.targetAlpha = 0;
    this.focus = nextFocus;
    this.host.dataset.focusId = nextFocus ?? "";
    this.drawOverview();
  }

  private wake() { if (!this.disposed) this.app.start(); }

  /** 输入即时生效，并先更新本地相机；连续 pointermove 不等 React 下一次 render。 */
  private publishCamera(cam: Camera) {
    this.camera = { ...cam }; this.targetCamera = { ...cam };
    this.props.onCameraChange(cam);
    this.wake();
  }

  private onScreen(x: number, y: number, width: number, height: number, pad = 50) {
    const sx = x * this.camera.zoom + this.camera.x, sy = y * this.camera.zoom + this.camera.y;
    const hw = width * this.camera.zoom / 2, hh = height * this.camera.zoom / 2;
    return sx + hw >= -pad && sx - hw <= this.width + pad && sy + hh >= -pad && sy - hh <= this.height + pad;
  }

  private createDisplay(n: PixiNode): Display {
    const box = new Container();
    const background = new Graphics();
    const name = new Text({ text: n.label, style: new TextStyle({ fontFamily: GRAPH_FONT, fontSize: NAME_PX,
      fill: 0x303b4c, fontWeight: n.isFocus ? "600" : "400" }), anchor: { x: 0, y: 0.5 } });
    box.addChild(background, name);
    this.world.addChild(box);
    return { box, background, name, date: null, signature: "" };
  }

  private updateDisplay(v: NodeVisual) {
    const n = v.data;
    const d = v.display!;
    const dates = this.props.level === "near" && !!n.sub;
    const nameVisible = this.props.level !== "far" || n.isFocus;
    const portColors = this.usedPorts.get(n.id);
    const signature = JSON.stringify([n.width, n.height, n.gender, n.isFocus, n.label, n.sub,
      dates, nameVisible, [...(portColors ?? [])]]);
    if (d.signature !== signature) {
      d.signature = signature;
      const hw = n.width / 2, hh = n.height / 2;
      const g = d.background;
      g.clear();
      if (n.isFocus) g.roundRect(-hw - 5, -hh - 5, n.width + 10, n.height + 10, 12)
        .stroke({ width: 2, color: 0x6b91cc, alpha: 0.25 });
      g.roundRect(-hw, -hh, n.width, n.height, 8).fill({ color: n.isFocus ? 0xf0f5ff : 0xffffff, alpha: 0.97 })
        .stroke({ width: n.isFocus ? 1.7 : 0.8, color: n.isFocus ? 0x527fbd : 0xd7dfe9 });
      const dotColor = n.gender === "M" ? 0x86a9d2 : n.gender === "F" ? 0xd9a1b7 : 0xa6afbc;
      g.circle(-hw + 11, dates ? -7 : 0, 3.4).fill(dotColor);
      for (const port of PORTS) {
        if (!n.isFocus && !portColors?.has(port)) continue;
        const p = gate({ x: 0, y: 0, width: n.width, height: n.height }, port);
        g.circle(p.x * UNIT_PX, p.y * UNIT_PX, 2.7)
          .fill(portColors?.get(port) ?? 0xffffff).stroke({ width: 0.9, color: portColors?.get(port) ?? 0xb8c5d6 });
      }
      d.name.text = n.label;
      d.name.style.fontWeight = n.isFocus ? "600" : "400";
      d.name.style.fill = n.isFocus ? 0x1c3f72 : 0x303b4c;
      d.name.position.set(-hw + 24, dates ? -8 : 0);
      d.name.visible = nameVisible;
      if (dates) {
        if (!d.date) {
          d.date = new Text({ text: n.sub!, style: new TextStyle({ fontFamily: GRAPH_FONT, fontSize: DATE_PX, fill: 0x8b96a8 }),
            anchor: { x: 0, y: 0.5 } });
          d.box.addChild(d.date);
        }
        d.date.text = n.sub!; d.date.position.set(-hw + 24, 10); d.date.visible = true;
      } else if (d.date) d.date.visible = false;
    }
    d.box.position.set(v.x, v.y);
    d.box.alpha = v.alpha;
    // 只做轻微缩放，避免姓名从重叠的一个点“炸开”。命中和线端仍取当前中心。
    d.box.scale.set(1);
  }

  private releaseDisplay(v: NodeVisual) {
    if (!v.display) return;
    v.display.box.destroy({ children: true });
    v.display = null;
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(50, this.app.ticker.deltaMS);
    const k = this.reduceMotion.matches ? 1 : 1 - Math.exp(-dt / 82);
    let animating = false;
    const blend = (from: number, to: number, epsilon: number) => {
      if (Math.abs(from - to) <= epsilon) return to;
      animating = true; return from + (to - from) * k;
    };
    if (this.targetCamera.animate) {
      this.camera = {
        x: blend(this.camera.x, this.targetCamera.x, 0.1),
        y: blend(this.camera.y, this.targetCamera.y, 0.1),
        zoom: blend(this.camera.zoom, this.targetCamera.zoom, 0.0002),
      };
    }
    this.world.position.set(this.camera.x, this.camera.y); this.world.scale.set(this.camera.zoom);
    for (const [id, v] of this.nodes) {
      v.x = blend(v.x, v.data.x * UNIT_PX, 0.08);
      v.y = blend(v.y, v.data.y * UNIT_PX, 0.08);
      v.alpha = blend(v.alpha, v.targetAlpha, 0.004);
      if (v.dying && v.alpha === 0) { this.releaseDisplay(v); this.nodes.delete(id); continue; }
      if (v.alpha >= v.targetAlpha - 0.02) v.entering = false;
      const currentVisible = this.onScreen(v.x, v.y, v.data.width, v.data.height);
      const targetVisible = this.onScreen(v.data.x * UNIT_PX, v.data.y * UNIT_PX, v.data.width, v.data.height);
      if (currentVisible && (!v.entering || targetVisible)) {
        if (!v.display) v.display = this.createDisplay(v.data);
        this.updateDisplay(v);
      } else this.releaseDisplay(v);
    }
    this.lines.clear();
    this.renderedEdges = [];
    const viewport: Box = {
      left: -this.camera.x / this.camera.zoom / UNIT_PX,
      right: (this.width - this.camera.x) / this.camera.zoom / UNIT_PX,
      top: -this.camera.y / this.camera.zoom / UNIT_PX,
      bottom: (this.height - this.camera.y) / this.camera.zoom / UNIT_PX,
    };
    for (const [id, v] of this.edges) {
      v.alpha = blend(v.alpha, v.targetAlpha, 0.004);
      if (v.alpha === 0 && v.targetAlpha === 0) { this.edges.delete(id); continue; }
      const a = this.nodes.get(v.data.from), b = this.nodes.get(v.data.to);
      if (!a || !b) continue;
      // 节点离屏可以回收 Text，但连接不能据此消失。用整条曲线的包围盒独立裁剪，
      // 最终精确的像素裁边交给 canvas/WebGL 视口，避免误删穿过屏幕的连接。
      const c = routeCurve({ x: a.x / UNIT_PX, y: a.y / UNIT_PX, width: a.data.width, height: a.data.height },
        { x: b.x / UNIT_PX, y: b.y / UNIT_PX, width: b.data.width, height: b.data.height }, v.data, this.props.curveStyle);
      if (!curveInViewport(c, viewport, 12 / this.camera.zoom / UNIT_PX)) continue;
      const appearance = (n: NodeVisual) => Math.min(1, n.alpha / (n.data.depth <= 1 ? 1 : 0.58));
      // 姓名的远景透明度不能再乘在线上；线的静态透明度只由真实跳数决定。
      const alpha = v.alpha * Math.min(appearance(a), appearance(b));
      const color = RELATION_COLORS[c.kind];
      this.lines.moveTo(c.x1 * UNIT_PX, c.y1 * UNIT_PX);
      if (this.props.curveStyle.type === "straight") this.lines.lineTo(c.x2 * UNIT_PX, c.y2 * UNIT_PX);
      else this.lines.bezierCurveTo(c.c1x * UNIT_PX, c.c1y * UNIT_PX, c.c2x * UNIT_PX, c.c2y * UNIT_PX,
        c.x2 * UNIT_PX, c.y2 * UNIT_PX);
      this.lines.stroke({ color, alpha, width: c.depth === 1 ? 1.65 : 1.1 });
      this.renderedEdges.push({ ...c, alpha, color });
    }
    this.drawRelationLabels();
    this.drawOverviewViewport();
    this.host.dataset.animating = String(animating);
    if (!animating) this.app.stop();
  };

  private drawRelationLabels() {
    const alive = new Set<string>();
    if (this.props.showRelationLabels) {
      const occupied = new BoxIndex(64); // 屏幕像素，标签的字号不随镜头缩成蚂蚁。
      for (const v of this.nodes.values()) {
        if (!v.display) continue;
        const x = v.x * this.camera.zoom + this.camera.x, y = v.y * this.camera.zoom + this.camera.y;
        const hw = v.data.width * this.camera.zoom / 2 + 5, hh = v.data.height * this.camera.zoom / 2 + 4;
        occupied.add({ left: x - hw, right: x + hw, top: y - hh, bottom: y + hh });
      }
      for (const c of [...this.renderedEdges].sort((a, b) => a.hop - b.hop)) {
        if (c.alpha < 0.02) continue;
        const text = RELATION_LABELS[c.kind];
        const width = text.length * 11 + 12;
        let anchor: { x: number; y: number } | null = null;
        for (const t of [0.5, 0.38, 0.62, 0.26, 0.74, 0.14, 0.86]) {
          const p = cubicPoint(c, t);
          const x = p.x * UNIT_PX * this.camera.zoom + this.camera.x;
          const y = p.y * UNIT_PX * this.camera.zoom + this.camera.y;
          const box = { left: x - width / 2, right: x + width / 2, top: y - 10, bottom: y + 10 };
          if (box.left < 4 || box.right > this.width - 4 || box.top < 4 || box.bottom > this.height - 4) continue;
          if (occupied.query(box).length) continue;
          occupied.add(box); anchor = p; break;
        }
        if (!anchor) continue; // 没有空位时不把关系文字强压在姓名上，连线本身仍绘制。
        alive.add(c.id);
        let label = this.relationLabels.get(c.id);
        if (!label) {
          const box = new Container();
          const background = new Graphics().roundRect(-width / 2, -9, width, 18, 4).fill({ color: 0xf8fafc, alpha: 0.97 });
          const name = new Text({ text, style: new TextStyle({ fontFamily: GRAPH_FONT, fontSize: 11,
            fill: RELATION_COLORS[c.kind] }), anchor: { x: 0.5, y: 0.5 } });
          box.addChild(background, name); this.labelLayer.addChild(box);
          label = { box, text: name }; this.relationLabels.set(c.id, label);
        }
        label.box.position.set(anchor.x * UNIT_PX, anchor.y * UNIT_PX);
        label.box.scale.set(1 / this.camera.zoom); label.box.alpha = c.alpha;
      }
    }
    for (const [id, label] of this.relationLabels) {
      if (!alive.has(id)) { label.box.destroy({ children: true }); this.relationLabels.delete(id); }
    }
  }

  private pick(sx: number, sy: number): string | null {
    const wx = (sx - this.camera.x) / this.camera.zoom, wy = (sy - this.camera.y) / this.camera.zoom;
    let hit: NodeVisual | null = null, distance = Infinity;
    for (const v of this.nodes.values()) {
      if (v.dying || !v.display || v.alpha < 0.2) continue;
      const pad = 5 / this.camera.zoom;
      if (Math.abs(wx - v.x) <= v.data.width / 2 + pad && Math.abs(wy - v.y) <= v.data.height / 2 + pad) {
        const d = Math.hypot(wx - v.x, wy - v.y);
        if (d < distance) { hit = v; distance = d; }
      }
    }
    return hit?.data.id ?? null;
  }

  private drawOverview() {
    this.mapBase.clear(); this.mapDots.clear();
    this.overview.visible = this.props.nodes.length > 1;
    if (!this.overview.visible) return;
    this.mapBase.roundRect(0, 0, this.mapWidth, this.mapHeight, 9)
      .fill({ color: 0xffffff, alpha: 0.94 }).stroke({ width: 1, color: 0xd8e0eb });
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const n of this.props.nodes) {
      left = Math.min(left, n.x * UNIT_PX - n.width / 2); right = Math.max(right, n.x * UNIT_PX + n.width / 2);
      top = Math.min(top, n.y * UNIT_PX - n.height / 2); bottom = Math.max(bottom, n.y * UNIT_PX + n.height / 2);
    }
    const scale = Math.min((this.mapWidth - 18) / (right - left), (this.mapHeight - 18) / (bottom - top));
    const x = (this.mapWidth - (right + left) * scale) / 2;
    const y = (this.mapHeight - (bottom + top) * scale) / 2;
    this.mapTransform = { x, y, scale };
    for (const n of this.props.nodes) if (!n.isFocus) this.mapDots.circle(x + n.x * UNIT_PX * scale, y + n.y * UNIT_PX * scale, n.depth === 1 ? 1.6 : 1);
    this.mapDots.fill({ color: 0x8297b2, alpha: 0.7 });
    const focus = this.props.nodes.find(n => n.isFocus);
    if (focus) this.mapDots.circle(x + focus.x * UNIT_PX * scale, y + focus.y * UNIT_PX * scale, 2.8).fill(0x527fbd);
  }

  private drawOverviewViewport() {
    this.mapView.clear();
    if (!this.overview.visible) return;
    const t = this.mapTransform;
    const x0 = Math.max(2, t.x + (-this.camera.x / this.camera.zoom) * t.scale);
    const y0 = Math.max(2, t.y + (-this.camera.y / this.camera.zoom) * t.scale);
    const x1 = Math.min(this.mapWidth - 2, t.x + ((this.width - this.camera.x) / this.camera.zoom) * t.scale);
    const y1 = Math.min(this.mapHeight - 2, t.y + ((this.height - this.camera.y) / this.camera.zoom) * t.scale);
    if (x1 > x0 && y1 > y0) this.mapView.rect(x0, y0, x1 - x0, y1 - y0)
      .fill({ color: 0x527fbd, alpha: 0.05 }).stroke({ width: 1, color: 0x7f9fc9, alpha: 0.8 });
  }

  private pickOverview(x: number, y: number): boolean {
    const px = x - this.overview.x, py = y - this.overview.y;
    if (!this.overview.visible || px < 0 || py < 0 || px > this.mapWidth || py > this.mapHeight) return false;
    const t = this.mapTransform;
    const cam = { zoom: this.camera.zoom, x: this.width / 2 - (px - t.x) / t.scale * this.camera.zoom,
      y: this.height * 0.44 - (py - t.y) / t.scale * this.camera.zoom, animate: true };
    this.targetCamera = cam;
    this.props.onCameraChange(cam); this.wake();
    return true;
  }

  /** 只读场景证据，供浏览器验收使用；不提供改焦点/改数据的旁门。 */
  inspect() {
    return {
      ready: !this.disposed, focus: this.focus, camera: { ...this.camera }, width: this.width, height: this.height,
      animating: this.host.dataset.animating === "true",
      nodes: [...this.nodes.values()].map(v => ({ id: v.data.id, label: v.data.label, depth: v.data.depth,
        x: v.x, y: v.y, width: v.data.width, height: v.data.height, alpha: v.alpha, dying: v.dying,
        rendered: !!v.display, labelVisible: v.display?.name.visible ?? false,
        screenX: v.x * this.camera.zoom + this.camera.x, screenY: v.y * this.camera.zoom + this.camera.y })),
      edges: this.renderedEdges.map(c => ({ ...c })),
      relationLabels: [...this.relationLabels].map(([id, label]) => ({ id, text: label.text.text,
        x: label.box.x, y: label.box.y, alpha: label.box.alpha })),
      minimap: { x: this.overview.x, y: this.overview.y, width: this.mapWidth, height: this.mapHeight },
    };
  }

  destroy() {
    this.disposed = true;
    this.detachInput(); this.observer.disconnect(); this.app.ticker.remove(this.tick);
    this.nodes.clear(); this.edges.clear();
    this.host.dataset.graphReady = "false";
    // Application 由 React wrapper 销毁，它也持有纹理和 renderer，不能只销毁 world。
  }
}

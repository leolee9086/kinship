/** 原生 canvas 输入层。捕获后的 pointer 事件仍会冒泡；不能据此猜测 window 收不到事件。 */
import type { Camera } from "./PixiGraph";
interface Pointer { x: number; y: number; startX: number; startY: number }
interface InputActions {
  camera: () => Camera;
  applyCamera: (camera: Camera) => void;
  pick: (x: number, y: number) => string | null;
  select: (id: string) => void;
  /** 返回 true 表示命中了小地图，已经处理，不再当节点点击。 */
  overview: (x: number, y: number) => boolean;
}

export function attachGraphInput(canvas: HTMLCanvasElement, actions: InputActions): () => void {
  const pointers = new Map<number, Pointer>();
  let moved = false;
  let lastCenter = { x: 0, y: 0 };
  let lastDistance = 0;
  const local = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  };
  const gesture = () => {
    const p = [...pointers.values()];
    const b = p[1] ?? p[0];
    return { center: { x: (p[0].x + b.x) / 2, y: (p[0].y + b.y) / 2 },
      distance: Math.hypot(p[0].x - b.x, p[0].y - b.y) };
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || pointers.size >= 2) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) moved = false;
    else moved = true; // 双指手势结束后不能误触节点。
    const g = gesture(); lastCenter = g.center; lastDistance = g.distance;
    canvas.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      const q = local(e.clientX, e.clientY);
      canvas.style.cursor = actions.pick(q.x, q.y) ? "pointer" : "grab";
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    const g = gesture();
    if (!moved && Math.hypot(p.x - p.startX, p.y - p.startY) <= 4) return;
    moved = true;
    const cam = actions.camera();
    const oldAnchor = local(lastCenter.x, lastCenter.y);
    const newAnchor = local(g.center.x, g.center.y);
    const zoom = Math.max(0.04, Math.min(4, cam.zoom * (lastDistance > 0 ? g.distance / lastDistance : 1)));
    const ratio = zoom / cam.zoom;
    // 同时处理双指中心平移与缩放，不只处理两个手指的距离。
    actions.applyCamera({ x: newAnchor.x - (oldAnchor.x - cam.x) * ratio,
      y: newAnchor.y - (oldAnchor.y - cam.y) * ratio, zoom });
    lastCenter = g.center; lastDistance = g.distance;
  };
  const finish = (e: PointerEvent, canceled: boolean) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pointers.size) {
      moved = true;
      const g = gesture(); lastCenter = g.center; lastDistance = g.distance;
      return;
    }
    canvas.style.cursor = "grab";
    if (canceled || moved) return;
    const q = local(e.clientX, e.clientY);
    if (actions.overview(q.x, q.y)) return;
    const id = actions.pick(q.x, q.y);
    if (id) actions.select(id);
  };
  const up = (e: PointerEvent) => finish(e, false);
  const cancel = (e: PointerEvent) => finish(e, true);
  const blur = () => { pointers.clear(); moved = true; canvas.style.cursor = "grab"; };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const cam = actions.camera();
    const p = local(e.clientX, e.clientY);
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    const zoom = Math.max(0.04, Math.min(4, cam.zoom * Math.exp(-delta * 0.0014)));
    const ratio = zoom / cam.zoom;
    actions.applyCamera({ x: p.x - (p.x - cam.x) * ratio, y: p.y - (p.y - cam.y) * ratio, zoom });
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("blur", blur);
  return () => {
    for (const id of pointers.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", cancel); canvas.removeEventListener("wheel", wheel);
    window.removeEventListener("blur", blur);
    pointers.clear();
  };
}

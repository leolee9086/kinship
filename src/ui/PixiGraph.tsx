/**
 * React / Pixi 边界。异步 init、观察尺寸、输入绑定、销毁必须属于同一个生命周期。
 * 具体布局不在这里；场景动画见 PlexScene，原生手势见 graphInput。
 */
import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import type { ConceptId } from "../domain/concepts";
import type { Curve, CurveStyle } from "./edges";
import type { NodeSize } from "./graphGeometry";
import { PlexScene } from "./PlexScene";
export { UNIT_PX } from "./graphGeometry";

export interface PixiNode extends NodeSize {
  id: ConceptId;
  x: number; y: number;
  label: string;
  sub?: string;
  accent: number;
  isRelation: boolean;
  isFocus: boolean;
  depth: number;
  emphasis: number;
}
export type PixiCurve = Curve;
export interface Camera {
  x: number; y: number; zoom: number;
  /** 聚焦/视图命令平滑过渡，手指和滚轮输入即时跟随。 */
  animate?: boolean;
}
export interface PixiGraphProps {
  nodes: PixiNode[];
  curves: PixiCurve[];
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  onNodeClick: (id: ConceptId) => void;
  onRelationClick: (id: ConceptId) => void;
  selectedRelation: ConceptId | null;
  onViewportChange: (width: number, height: number) => void;
  curveStyle: CurveStyle;
  showRelationLabels: boolean;
  level: "far" | "mid" | "near";
}

interface InspectRequest { snapshot?: ReturnType<PlexScene["inspect"]> }
/** 验收只能读真实场景。用宿主事件跨过 HMR 模块版本边界，不能操作场景。 */
export function inspectGraph(host: Element) {
  const detail: InspectRequest = {};
  host.dispatchEvent(new CustomEvent("kinship:inspect", { detail }));
  if (!detail.snapshot) throw new Error("图场景尚未就绪");
  return detail.snapshot;
}

export function PixiGraph(props: PixiGraphProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlexScene | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialized = false;
    let scene: PlexScene | null = null;
    const app = new Application();
    const inspect = (event: Event) => {
      if (scene) (event as CustomEvent<InspectRequest>).detail.snapshot = scene.inspect();
    };
    void (async () => {
      try {
        await app.init({
          width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
          backgroundAlpha: 0, antialias: true,
          resolution: Math.min(devicePixelRatio, 2), autoDensity: true, autoStart: false,
        });
        initialized = true;
        // StrictMode 的第一轮可能已卸载。只销毁它自己的已完成实例。
        if (disposed) { app.destroy(true, { children: true }); return; }
        host.appendChild(app.canvas);
        scene = new PlexScene(app, host, latest.current);
        sceneRef.current = scene;
        host.addEventListener("kinship:inspect", inspect);
      } catch (e) {
        console.error("Kinship 画布初始化失败", e);
        if (!disposed) setError(String(e));
      }
    })();
    return () => {
      disposed = true;
      scene?.destroy();
      if (sceneRef.current === scene) sceneRef.current = null;
      host.removeEventListener("kinship:inspect", inspect);
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => { sceneRef.current?.update(props); }, [props]);

  return (
    <div ref={hostRef} className="pixi-host" role="region" aria-label="概念关系画布">
      {error && <div className="error" role="alert">画布无法初始化：{error}</div>}
    </div>
  );
}

/** 底部操作、统计及小地图占位共用实际布局，窄容器不再依赖互相独立的绝对定位。 */
import { useLayoutEffect, useRef } from "react";
import type { Camera, OverviewRect } from "./PixiGraph";
import "./graphFooter.css";
interface Props {
  camera: Camera;
  displayed: number;
  connections: number;
  concepts: number;
  relations: number;
  omitted: number;
  budget: number;
  onZoom(factor: number): void;
  onRecenter(): void;
  onFit(): void;
  onOverviewChange(rect: OverviewRect | null): void;
}
export function GraphFooter({ camera, displayed, connections, concepts, relations, omitted, budget, onZoom, onRecenter, onFit, onOverviewChange }: Props) {
  const footer = useRef<HTMLDivElement>(null), slot = useRef<HTMLDivElement>(null);
  const hasOverview = displayed > 1;
  useLayoutEffect(() => {
    const container = footer.current, placeholder = slot.current, stage = container?.parentElement;
    if (!container || !placeholder || !stage) return;
    let previous = "";
    const measure = () => {
      const host = stage.getBoundingClientRect(), bounds = placeholder.getBoundingClientRect();
      const rect = hasOverview ? { x: bounds.left - host.left, y: bounds.top - host.top, width: bounds.width, height: bounds.height } : null;
      const key = JSON.stringify(rect);
      if (key !== previous) { previous = key; onOverviewChange(rect); }
    };
    // 侧栏、旋转、字体和换行都会改变实际占位；只向场景发布几何，不复制渲染内容。
    const observer = new ResizeObserver(measure);
    for (const element of [container, placeholder, stage]) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [hasOverview, onOverviewChange]);
  return <div ref={footer} className={`graph-footer${hasOverview ? " has-overview" : ""}`}>
    <div className="region-caption down" aria-hidden="true">下方</div>
    <div className="canvas-controls" role="group" aria-label="画布视图操作">
      <button aria-label="缩小" onClick={() => onZoom(1 / 1.2)}>−</button>
      <output aria-label="当前缩放">{Math.round(camera.zoom * 100)}%</output>
      <button aria-label="放大" onClick={() => onZoom(1.2)}>＋</button>
      <button onClick={onRecenter}>回到焦点</button><button onClick={onFit}>适应邻域</button>
    </div>
    <div className="graph-status">{displayed} 个显示概念 · {connections} 条连接投影
      <span>全库 {concepts} 概念 / {relations} 关系实例</span>
      {!!omitted && <span className="limit-note">邻域显示上限 {budget}，另有 {omitted} 个已发现概念；搜索可聚焦完整概念库。</span>}
    </div>
    <div ref={slot} className="graph-overview-slot" hidden={!hasOverview} aria-hidden="true" />
  </div>;
}

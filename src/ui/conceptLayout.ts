/** 文本感知的四方布局。四个间距均从文字框边缘计算，次要关系不抢占主轴。 */
import type { GraphProjection, ProjectedNode } from "../domain/projection";
import type { Region } from "../domain/concepts";
import { BoxIndex, UNIT_PX, nodeBox, type NodeSize, type MeasureNode } from "./graphGeometry";
export interface ConceptPlacement extends NodeSize {
  id: string; x: number; y: number; depth: number; region: Region; emphasis: number;
}
export function layoutConcepts(projection: GraphProjection, focus: string, measure: MeasureNode, gaps: Record<Region, number>) {
  const positions = new Map<string, ConceptPlacement>();
  const center: ConceptPlacement = { id: focus, x: 0, y: 0, depth: 0, region: "right", emphasis: 1, ...measure(focus, true) };
  positions.set(focus, center);
  const occupied = new BoxIndex(2); occupied.add(nodeBox(center, 0.08));
  const groups: Record<Region, ProjectedNode[]> = { up: [], down: [], left: [], right: [] };
  for (const n of projection.nodes.values()) if (n.id !== focus) groups[n.region].push(n);
  for (const region of ["up", "down", "left", "right"] as const) {
    if (!Number.isFinite(gaps[region]) || gaps[region] < 16) throw new Error(`“${region}”缺少有效的概念间距`);
    const nodes = groups[region].sort((a, b) => b.emphasis - a.emphasis || a.depth - b.depth || b.priority - a.priority || a.id.localeCompare(b.id));
    const cursors = new Map<number, number>();
    for (const item of nodes) {
      const size = measure(item.id, false), i = cursors.get(item.depth) ?? 0;
      cursors.set(item.depth, i + 1);
      const p: ConceptPlacement = { id: item.id, ...size, depth: item.depth, region, emphasis: item.emphasis, x: 0, y: 0 };
      const vertical = region === "up" || region === "down";
      const direction = region === "up" || region === "left" ? -1 : 1;
      if (vertical) {
        const wing = i % 2 === 0 ? -1 : 1;
        p.x = wing * (center.width / 2 + size.width / 2 + 38 + Math.sin(Math.min(1, i / 12) * Math.PI) * 38) / UNIT_PX;
        p.y = direction * (center.height / 2 + size.height / 2 + gaps[region]
          + Math.floor(i / 2) * (size.height + 24) + (item.depth - 1) * (gaps[region] + 80)) / UNIT_PX;
      } else {
        const row = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        p.x = direction * (center.width / 2 + size.width / 2 + gaps[region] + (item.depth - 1) * (gaps[region] + 140)) / UNIT_PX;
        p.y = row * (size.height + 24) / UNIT_PX;
      }
      let attempts = 0;
      while (occupied.query(nodeBox(p, 0.075)).length) {
        if (vertical) p.y += direction * (size.height + 22) / UNIT_PX;
        else p.x += direction * 38 / UNIT_PX;
        if (++attempts > nodes.length * 20 + 100) throw new Error("无法满足当前文本框布局约束");
      }
      positions.set(item.id, p); occupied.add(nodeBox(p, 0.075));
    }
  }
  return positions;
}

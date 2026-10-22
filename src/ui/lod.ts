/**
 * 细节层级（LOD）。
 *
 * 关键纠正：LOD 绝不能改变节点尺寸。
 *
 * 原因：坐标、连线半径都以「圆直径」为基准。
 * 一旦节点直径随 LOD 变，圆心位置和线段端点就对不上，
 * 表现就是“一缩小全部错位”。
 *
 * 所以：节点直径全局恒定（PERSON_DIAMETER），
 * LOD 只控制「文字显不显示、字号多大、边多粗」。
 */

export type LodLevel = "far" | "mid" | "near";

/** 人物圆的像素直径。全项目唯一真源。 */
export const PERSON_DIAMETER = 96;

/** 圆半径。 */
export const PERSON_RADIUS = PERSON_DIAMETER / 2;

export interface LodSpec {
  level: LodLevel;
  showName: boolean;
  showDates: boolean;
  font: number;
  edgeWidth: number;
  showEdgeLabel: boolean;
}

export const LOD_SPECS: Record<LodLevel, LodSpec> = {
  far: { level: "far", showName: false, showDates: false, font: 0, edgeWidth: 1, showEdgeLabel: false },
  mid: { level: "mid", showName: true, showDates: false, font: 11, edgeWidth: 1.2, showEdgeLabel: false },
  near: { level: "near", showName: true, showDates: true, font: 13, edgeWidth: 1.5, showEdgeLabel: true },
};

/** 按缩放比例选级。 */
export function levelFor(zoom: number): LodLevel {
  if (zoom < 0.35) return "far";
  if (zoom < 0.75) return "mid";
  return "near";
}

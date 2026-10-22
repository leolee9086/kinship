/**
 * 单位坐标 → 像素。
 *
 * 全项目唯一换算点。
 * 布局与布线一律输出单位坐标（圆直径 = 1），
 * 只在这里乘一次 PERSON_DIAMETER。
 *
 * 这是“一缩小就全错位”的根本解法：
 * 坐标与节点尺寸彻底解耦，缩放只影响 React Flow 的 viewport，
 * 不影响布局结果。
 */

import { PERSON_DIAMETER } from "./lod";
import type { Placed } from "./layout";

export interface PixelPoint {
  x: number;
  y: number;
}

/** 把一个单位坐标点转成像素坐标（圆心）。 */
export function toPixels(p: Placed): PixelPoint {
  return { x: p.x * PERSON_DIAMETER, y: p.y * PERSON_DIAMETER };
}

/** 把 React Flow 节点左上角坐标算出来（圆心减去半径）。 */
export function toNodePosition(p: Placed): PixelPoint {
  const c = toPixels(p);
  return { x: c.x - PERSON_DIAMETER / 2, y: c.y - PERSON_DIAMETER / 2 };
}

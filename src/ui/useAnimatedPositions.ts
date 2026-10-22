/**
 * 布局过渡。
 *
 * 问题：焦点一变，position 直接换成新值，React Flow 会瞬间跳过去。
 * 做法：用 rAF 对每个节点独立插值，新节点从旧焦点位置长出，旧节点滑走。
 *
 * 关键：这个 hook 只负责「坐标怎么变」，不关心 LOD。
 */

import { useEffect, useRef, useState } from "react";
import type { NodeId } from "../domain/types";

interface Point {
  x: number;
  y: number;
}

const DURATION = 420;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 把目标位置平滑插值。
 *
 * @param target 目标布局
 * @param spawnFrom 新节点从哪里长出
 */
export function useAnimatedPositions(
  target: Record<NodeId, Point>,
  spawnFrom?: Point
): Record<NodeId, Point> {
  const frameRef = useRef<Record<NodeId, Point>>(target);
  const [render, setRender] = useState<Record<NodeId, Point>>(target);
  const rafRef = useRef<number>(0);
  const spawnRef = useRef<Point | undefined>(spawnFrom);
  spawnRef.current = spawnFrom;

  // 用坐标签名判断是否需要重跑，避免每次 render 都新建对象导致无限循环
  const sig = Object.keys(target)
    .sort()
    .map((k) => `${k}:${Math.round(target[k].x)},${Math.round(target[k].y)}`)
    .join("|");

  useEffect(() => {
    const current = frameRef.current;
    const spawn = spawnRef.current;

    const from: Record<NodeId, Point> = {};
    for (const id of Object.keys(target)) {
      from[id] = current[id] ?? spawn ?? target[id];
    }

    const start = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / DURATION);
      const k = easeOutCubic(t);

      const next: Record<NodeId, Point> = {};
      for (const id of Object.keys(target)) {
        const a = from[id];
        const b = target[id];
        next[id] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }

      frameRef.current = next;
      setRender(next);

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return render;
}

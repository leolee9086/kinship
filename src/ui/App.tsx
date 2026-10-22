/** React 负责编辑与适配器操作；文字布局、关系路由、Pixi 场景各自独立。 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DataAdapter } from "../adapter/types";
import { useGraph } from "./useGraph";
import { useKeyboard } from "./useKeyboard";
import {
  buildIndex,
  plexLayout,
  DEFAULT_PLEX,
} from "./layout";
import { buildCurves, DEFAULT_CURVE, RELATION_COLORS, RELATION_LABELS } from "./edges";
import { createTextMeasurer, nodeBox, type NodeLabel } from "./graphGeometry";
import type { RelationKind } from "./layout";
import {
  PixiGraph,
  UNIT_PX,
  type Camera,
  type PixiNode,
  type PixiCurve,
} from "./PixiGraph";
import { displayName, yearOf, type NodeId } from "../domain/types";

/** 按缩放选择 LOD。 */
function levelFor(zoom: number): "far" | "mid" | "near" {
  if (zoom < 0.4) return "far";
  if (zoom < 0.85) return "mid";
  return "near";
}

function Inner({ adapter }: { adapter: DataAdapter }) {
  const g = useGraph(adapter);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [viewDepth, setViewDepth] = useState(2);
  const [jumpGap, setJumpGap] = useState(DEFAULT_PLEX.jumpGap);
  const [curveStyle, setCurveStyle] = useState(DEFAULT_CURVE);
  const [showRelationLabels, setShowRelationLabels] = useState(false);
  const textMeasurer = useMemo(() => createTextMeasurer(), []);
  const onViewportChange = useCallback((width: number, height: number) => {
    setViewport(old => old.width === width && old.height === height ? old : { width, height });
  }, []);

  const { persons, families, events, focus } = g.state;

  const index = useMemo(() => buildIndex(families), [families]);

  const focusPerson = useMemo(
    () => persons.find((p) => p.id === focus) ?? null,
    [persons, focus]
  );

  const level = levelFor(camera.zoom);

  const startEdit = useCallback(() => {
    if (!focusPerson) return;
    setDraft(displayName(focusPerson));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [focusPerson]);

  const commitEdit = useCallback(async () => {
    if (!focus) return;
    const name = draft.trim();
    setEditing(false);
    if (!name) return;
    await g.renamePerson(focus, name);
  }, [draft, focus, g]);

  const isEditing = useCallback(() => editing, [editing]);

  useKeyboard({
    isEditing,
    move: (dir) => {
      if (!focus) return;
      const next = g.neighbor(focus, dir);
      if (next) g.setFocus(next);
    },
    edit: startEdit,
    addChild: () => void g.quickAdd("child"),
    addParent: () => void g.quickAdd("parent"),
    addSpouse: () => void g.quickAdd("spouse"),
    remove: () => {
      if (!focus) return;
      const p = persons.find((x) => x.id === focus);
      if (p && window.confirm(`删除「${displayName(p)}」及其关系？`)) void g.removePerson(focus);
    },
    cancel: () => setEditing(false),
    help: () => setHelpOpen((v) => !v),
  });

  /* ---------------- 布局 ---------------- */

  const personById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);

  // 姓名和生卒年使用与渲染相同的字体测量，尺寸中包含完整的文字框。
  const labels = useMemo(() => {
    const eventById = new Map(events.map(e => [e.id, e]));
    const out = new Map<NodeId, NodeLabel>();
    for (const person of persons) {
      const ownEvents = (person.eventRefs ?? []).map(id => eventById.get(id)).filter(e => e !== undefined);
      const born = yearOf(ownEvents, person.eventRefs, "Birth");
      const died = yearOf(ownEvents, person.eventRefs, "Death");
      out.set(person.id, {
        label: displayName(person),
        sub: born !== "?" || died !== "?" ? `${born}–${died}` : undefined,
      });
    }
    return out;
  }, [persons, events]);
  const measureNode = useCallback((id: NodeId, isFocus: boolean) => {
    const text = labels.get(id);
    if (!text) throw new Error(`关系中的人物不存在：${id}`);
    return textMeasurer(text, isFocus);
  }, [labels, textMeasurer]);

  const layoutResult = useMemo(() => {
    if (!focus) return null;
    return plexLayout(focus, index, measureNode, { ...DEFAULT_PLEX, depth: viewDepth, jumpGap });
  }, [focus, index, measureNode, viewDepth, jumpGap]);

  const curves = useMemo(() => {
    if (!layoutResult) return [];
    return buildCurves(layoutResult.positions, layoutResult.links, curveStyle);
  }, [layoutResult, curveStyle]);

  /* ---------------- 节点数据（给 Pixi） ---------------- */

  const pixiNodes = useMemo<PixiNode[]>(() => {
    if (!layoutResult) return [];
    const out: PixiNode[] = [];
    for (const [id, p] of layoutResult.positions) {
      const person = personById.get(id);
      const text = labels.get(id);
      if (!person || !text) throw new Error(`布局人物缺失：${id}`);
      out.push({
        id, x: p.x, y: p.y, ...text,
        width: p.width, height: p.height,
        gender: person.gender, isFocus: id === focus,
        depth: p.depth, zone: p.zone, labelSide: p.labelSide,
      });
    }
    return out;
  }, [layoutResult, personById, labels, focus]);

  // 身份、端点与实际关系类型一起交给渲染层，过渡时才能让线跟着节点走。
  const pixiCurves = useMemo<PixiCurve[]>(() => curves, [curves]);

  // 正常聚焦保留缩放、平滑移到新焦点。不能每次都 fit 全图，把文字缩成蚂蚁。
  // 尺寸来自 Pixi 宿主的 ResizeObserver，异步初始化和手机转屏都会重跑。
  useEffect(() => {
    if (!focus || viewport.width === 0 || viewport.height === 0) return;
    setCamera(cam => ({ ...cam, x: viewport.width / 2, y: viewport.height * 0.44, animate: true }));
  }, [focus, viewport]);

  const centerFocus = useCallback(() => {
    setCamera(cam => ({ ...cam, x: viewport.width / 2, y: viewport.height * 0.44, animate: true }));
  }, [viewport]);

  const fitNeighborhood = useCallback(() => {
    if (!layoutResult || !viewport.width || !viewport.height) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const p of layoutResult.positions.values()) {
      const b = nodeBox(p);
      left = Math.min(left, b.left * UNIT_PX); right = Math.max(right, b.right * UNIT_PX);
      top = Math.min(top, b.top * UNIT_PX); bottom = Math.max(bottom, b.bottom * UNIT_PX);
    }
    const zoom = Math.min(1, (viewport.width - 56) / (right - left), (viewport.height - 88) / (bottom - top));
    setCamera({ zoom, x: viewport.width / 2 - (left + right) * zoom / 2,
      y: viewport.height / 2 - (top + bottom) * zoom / 2, animate: true });
  }, [layoutResult, viewport]);

  const onNodeClick = useCallback(
    (id: NodeId) => {
      g.setFocus(id);
    },
    [g]
  );

  if (g.state.loading) return <div className="loading">载入中…</div>;

  return (
    <div className="app">
      <header className="bar">
        <strong>Kinship</strong>
        <span className="hint desktop-only">
          ↑↓←→ 移动 · Enter 改名 · a 子女 · p 父母 · s 配偶 · Del 删除
        </span>
        <span className="count">
          {pixiNodes.length} / {persons.length} 人
        </span>
        <button className="btn" onClick={() => setHelpOpen((v) => !v)}>
          帮助
        </button>
      </header>

      {g.state.error && <div className="error">{g.state.error}</div>}

      {persons.length === 0 && (
        <div className="empty">
          <p>还没有人</p>
          <p>点下方按钮添加第一个人</p>
        </div>
      )}

      <div className="canvas">
        <PixiGraph
          nodes={pixiNodes}
          curves={pixiCurves}
          camera={camera}
          onCameraChange={setCamera}
          onNodeClick={onNodeClick}
          onViewportChange={onViewportChange}
          curveStyle={curveStyle}
          showRelationLabels={showRelationLabels}
          level={level}
        />
        <div className="graph-tools" aria-label="图视图设置">
          <button className="btn" onClick={centerFocus}>回到焦点</button>
          <button className="btn" onClick={fitNeighborhood}>适应邻域</button>
          <label>展开
            <select aria-label="关系展开层数" value={viewDepth} onChange={e => setViewDepth(Number(e.target.value))}>
              <option value={1}>一级</option><option value={2}>二级</option><option value={3}>三级</option>
            </select>
          </label>
          <label>连线
            <select aria-label="连线样式" value={curveStyle.type}
              onChange={e => setCurveStyle(s => ({ ...s, type: e.target.value as "bezier" | "straight" }))}>
              <option value="bezier">曲线</option><option value="straight">直线</option>
            </select>
          </label>
          <label className="relation-label-switch">
            <input type="checkbox" checked={showRelationLabels}
              onChange={e => setShowRelationLabels(e.target.checked)} />关系文字
          </label>
          <details className="layout-settings">
            <summary>布局</summary>
            <div className="layout-settings-panel">
              <label htmlFor="jump-gap">左侧跳跃节点距离 <output>{jumpGap}px</output></label>
              <input id="jump-gap" aria-label="左侧跳跃节点距离" type="range" min={24} max={360} step={4}
                value={jumpGap} onChange={e => setJumpGap(Number(e.target.value))} />
              <p>焦点与左侧配偶文字框的基准间距；发生文字碰撞时才额外避让。</p>
            </div>
          </details>
        </div>
        <div className="relation-legend" aria-label="关系颜色图例">
          {(Object.keys(RELATION_LABELS) as RelationKind[]).map(kind => (
            <span key={kind}><i style={{ background: `#${RELATION_COLORS[kind].toString(16).padStart(6, "0")}` }} />{RELATION_LABELS[kind]}</span>
          ))}
        </div>
        <div className="focus-caption" aria-live="polite">
          {focusPerson && <><span>当前焦点</span><strong>{displayName(focusPerson)}</strong></>}
        </div>
      </div>

      <nav className="fab-bar">
        <button className="fab" onClick={() => void g.quickAdd("parent")}>
          父母
        </button>
        <button className="fab" onClick={startEdit}>
          改名
        </button>
        <button className="fab primary" onClick={() => void g.quickAdd("child")}>
          子女
        </button>
        <button className="fab" onClick={() => void g.quickAdd("spouse")}>
          配偶
        </button>
      </nav>

      <AnimatePresence>
        {editing && (
          <motion.div
            className="editor"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.15 }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="姓名"
              inputMode="text"
            />
            <button className="btn primary" onClick={() => void commitEdit()}>
              保存
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              取消
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen && (
          <motion.div
            className="help"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <h3>操作</h3>
            <p className="sub">父母在上 · 子女在下 · 兄弟在右 · 配偶在左</p>
            <ul>
              <li>
                <kbd>↑</kbd> 父母 · <kbd>↓</kbd> 子女 · <kbd>←→</kbd> 兄弟/配偶
              </li>
              <li>
                <kbd>Enter</kbd> 改名
              </li>
              <li>
                <kbd>a</kbd> 加子女 · <kbd>p</kbd> 加父母 · <kbd>s</kbd> 加配偶
              </li>
              <li>
                <kbd>Del</kbd> 删除
              </li>
              <li>滚轮缩放，拖拽平移</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function App({ adapter }: { adapter: DataAdapter }) {
  return <Inner adapter={adapter} />;
}

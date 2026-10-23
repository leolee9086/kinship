/** 通用概念工作台。布局、领域和存储后端各有边界，UI 只调用 DataAdapter。 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { Concept, ConceptSnapshot, ColorAxis } from "../domain/concepts";
import { coreVocabulary } from "../domain/coreVocabulary";
import { ConceptIndex } from "../domain/conceptIndex";
import { ConceptCatalog } from "../domain/conceptCatalog";
import { projectGraph, relationColor } from "../domain/projection";
import { PixiGraph, type Camera, type PixiNode } from "./PixiGraph";
import { buildCurves, type CurveStyle } from "./edges";
import { perspectivePreset } from "../domain/perspectives";
import { PerspectiveControls } from "./PerspectiveControls";
import { createTextMeasurer, UNIT_PX } from "./graphGeometry";
import { layoutConcepts } from "./conceptLayout";
import { Background } from "./Background";
import { ConceptEditor, type EditorMode } from "./ConceptEditor";
import { ViewSettings } from "./ViewSettings";
import { ConceptLibraryList } from "./ConceptLibraryList";
import { useConceptGraph } from "./useConceptGraph";
import { useWorkspacePanels } from "./useWorkspacePanels";
import "./app.css";

type GraphState = ReturnType<typeof useConceptGraph>;
export function App({ adapter }: { adapter: DataAdapter }) {
  const graph = useConceptGraph(adapter);
  if (!graph.snapshot) return <main className="loading-screen"><span className="brand-mark">k</span><h1>Kinship</h1>
    {graph.error ? <p role="alert">{graph.error}</p> : <p>正在打开概念图谱…</p>}</main>;
  return <Workspace adapter={adapter} graph={graph} snapshot={graph.snapshot} />;
}

function Workspace({ adapter, graph, snapshot }: { adapter: DataAdapter; graph: GraphState; snapshot: ConceptSnapshot }) {
  const settings = snapshot.settings;
  const index = useMemo(() => new ConceptIndex(snapshot.concepts), [snapshot.concepts]);
  const focus = settings.focusId;
  const [inspected, setInspected] = useState<string | null>(focus);
  const { panel, library, setPanel, setLibrary } = useWorkspacePanels();
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  useEffect(() => setRevealed(new Set()), [focus, settings.perspective.presetId]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"instances" | "types" | "roles">("instances");
  const [editor, setEditor] = useState<{ mode: EditorMode; initial?: Concept; expectedVersion?: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 0.82 });
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const curveStyle: CurveStyle = settings.curve;
  const search = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);
  const measureText = useMemo(createTextMeasurer, []);
  const labels = useMemo(() => new Map(index.concepts.map(c => [c.id, {
    label: c.label, sub: index.typeLabel(c),
  }])), [index]);
  const projection = useMemo(() => focus ? projectGraph(index, focus, settings, 600, revealed) : null,
    [index, focus, settings.viewId, settings.views, settings.depth, settings.colorAxis, settings.colorDepth, settings.palette, settings.expandedRelations, settings.regionOverrides, settings.perspective, settings.dimOpacity, revealed]);
  const positions = useMemo(() => projection && focus ? layoutConcepts(projection, focus, (id, isFocus) => measureText(labels.get(id)!, isFocus), settings.regionGaps) : new Map(),
    [projection, focus, measureText, labels, settings.regionGaps]);
  const curves = useMemo(() => projection ? buildCurves(positions, projection.links, curveStyle) : [], [positions, projection, curveStyle]);
  const nodes = useMemo<PixiNode[]>(() => [...positions.values()].map(p => {
    const concept = index.get(p.id), style = labels.get(p.id)!;
    const accent = concept.participants ? relationColor(index, concept, settings).color
      : Number.parseInt((index.get(concept.types[0]).schema?.color ?? "#7b8fa3").slice(1), 16);
    return { ...p, ...style, accent, isFocus: p.id === focus, isRelation: !!concept.participants };
  }), [positions, index, labels, focus, settings.colorAxis, settings.colorDepth, settings.palette]);
  const view = settings.views.find(v => v.id === settings.viewId)!;
  const perspective = perspectivePreset(settings.perspective);
  const selected = inspected ? index.byId.get(inspected) : undefined;
  const catalog = useMemo(() => new ConceptCatalog(index), [index]);
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(() => catalog.search(tab, deferredQuery, settings.perspective),
    [catalog, deferredQuery, tab, settings.perspective]);
  const legend = useMemo(() => [...new Map(curves.map(c => [c.colorKey, { key: c.colorKey, label: c.colorLabel, color: c.color }])).values()], [curves]);

  const recenter = useCallback(() => setCamera(c => ({ ...c, x: viewport.width / 2, y: viewport.height * 0.46, animate: true })), [viewport]);
  const choose = useCallback((id: string) => {
    index.get(id);
    if (focus && focus !== id) history.current.push(focus);
    graph.changeSettings({ focusId: id }); setInspected(id); setLibrary(false);
    recenter();
  }, [index, focus, graph.changeSettings, recenter]);
  const fit = () => {
    if (!nodes.length) return;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const n of nodes) { left = Math.min(left, n.x * UNIT_PX - n.width / 2); right = Math.max(right, n.x * UNIT_PX + n.width / 2);
      top = Math.min(top, n.y * UNIT_PX - n.height / 2); bottom = Math.max(bottom, n.y * UNIT_PX + n.height / 2); }
    const zoom = Math.min(1.2, Math.max(0.04, Math.min((viewport.width - 120) / Math.max(1, right - left), (viewport.height - 170) / Math.max(1, bottom - top))));
    setCamera({ x: viewport.width / 2 - (left + right) / 2 * zoom, y: viewport.height * 0.48 - (top + bottom) / 2 * zoom, zoom, animate: true });
  };
  const openEditor = (concept?: Concept) => setEditor({ initial: concept, expectedVersion: concept ? snapshot.conceptVersions[concept.id] : undefined,
    mode: concept ? index.isType(concept) ? "type" : index.isRole(concept) ? "role" : concept.participants ? "relation" : "concept" : "concept" });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,button,summary,[contenteditable=true],[role=dialog]")) return;
      if (event.key === "Escape") { setEditor(null); setHelp(false); setPanel(null); setLibrary(false); return; }
      if (editor || help) return;
      if (event.key === "/") { event.preventDefault(); setLibrary(true); requestAnimationFrame(() => search.current?.focus()); return; }
      if (event.key === "?") { setHelp(true); return; }
      if (event.key.toLowerCase() === "n") { setEditor({ mode: "concept" }); return; }
      if (event.key.toLowerCase() === "r") { setEditor({ mode: "relation" }); return; }
      if (event.key === "Enter" && focus) { event.preventDefault(); openEditor(index.get(focus)); return; }
      if (event.key === "Backspace") { event.preventDefault(); const id = history.current.pop(); if (id && index.byId.has(id)) { graph.changeSettings({ focusId: id }); setInspected(id); recenter(); } return; }
      const vector = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[event.key];
      if (!vector || !focus) return;
      event.preventDefault();
      const candidates = nodes.filter(n => n.id !== focus && n.emphasis === 1 && n.x * vector[0] + n.y * vector[1] > 0.02)
        .map(n => ({ n, score: Math.hypot(n.x, n.y) + Math.abs(n.x * vector[1] - n.y * vector[0]) * 1.5 + n.depth * 0.3 })).sort((a, b) => a.score - b.score);
      if (candidates[0]) choose(candidates[0].n.id);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });

  const toggleExpanded = (id: string) => graph.changeSettings({ expandedRelations: settings.expandedRelations.includes(id)
    ? settings.expandedRelations.filter(r => r !== id) : [...settings.expandedRelations, id] });
  const saveConcept = async (concept: Concept) => {
    // 使用打开编辑器时的版本，保存期间刷新状态也不能悄悄覆盖他人的修改。
    await graph.mutate({ put: [concept] }, { expectedVersions: { [concept.id]: editor?.expectedVersion ?? null },
      ...(editor?.initial ? { initialConcepts: { [concept.id]: editor.initial } } : {}) });
    setInspected(concept.id); setEditor(null);
  };
  const deleteSelected = async () => {
    if (!selected) return;
    try { await graph.mutate({ remove: [selected.id] }); setInspected(null); setPanel(null); } catch { /* 数据层已经显示具体的引用约束错误。 */ }
  };
  const onViewport = useCallback((width: number, height: number) => setViewport({ width, height }), []);
  const relationCount = index.concepts.filter(c => !!c.participants).length;

  return <main className="workspace">
    <header className="app-header"><div className="brand"><span className="brand-mark">k</span><div><strong>Kinship</strong><span>概念之间，皆有关联。</span></div></div>
      <div className="header-actions"><span className="save-status" role="status">{graph.pending ? "正在保存…" : graph.error ? "存在未保存变更" : "已保存到概念仓库"}</span>
        <button className={library ? "active" : ""} onClick={() => setLibrary(v => !v)}>概念库</button>
        <button className={panel === "settings" ? "active" : ""} onClick={() => setPanel(p => p === "settings" ? null : "settings")}>视图与背景</button>
        <button aria-label="键盘帮助" onClick={() => setHelp(true)}>?</button></div>
    </header>
    {graph.error && <div className="error-banner" role="alert"><span>{graph.error}</span><button onClick={graph.clearError} aria-label="关闭错误提示">×</button></div>}
    <div className="work-area">
      <aside className={`concept-library ${library ? "is-open" : ""}`}>
        <div className="library-heading"><span className="eyebrow">YOUR CONCEPT ATLAS</span><h2>概念图谱 <span>{index.concepts.length}</span></h2></div>
        <label className="search-field"><span>⌕</span><input ref={search} aria-label="搜索概念" placeholder="搜索概念、类型或别名" value={query} onChange={e => setQuery(e.target.value)} /><kbd>/</kbd></label>
        <div className="library-tabs" role="group" aria-label="概念类别">{([['instances', '概念'], ['types', '类型'], ['roles', '角色']] as const).map(([id, text]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{text}</button>)}</div>
        <ConceptLibraryList concepts={visible} index={index} focus={focus} onChoose={choose} category={tab === "types" ? "类型概念" : tab === "roles" ? "角色概念" : "实例概念"} />
        <div className="library-footer"><button className="primary" onClick={() => setEditor({ mode: "concept" })}>＋ 新建概念</button><button onClick={() => setEditor({ mode: "relation" })}>新建关系</button>
          <div><button onClick={() => setEditor({ mode: "type" })}>＋ 类型</button><button onClick={() => setEditor({ mode: "role" })}>＋ 角色</button></div></div>
      </aside>
      <section className="graph-stage" aria-label="概念工作区">
        <Background adapter={adapter} settings={settings.background} onError={graph.reportError} />
        <div className="graph-toolbar"><label className="view-select"><span>视角</span><select aria-label="视角" value={settings.perspective.presetId} onChange={e => graph.changeSettings({ perspective: { ...settings.perspective, presetId: e.target.value } })}>{settings.perspective.presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <button onClick={() => setPanel("perspective")}>配置视角</button>
          <div className="tool-divider" /><label>邻域<select aria-label="邻域深度" value={settings.depth} onChange={e => graph.changeSettings({ depth: Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} 跳</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={settings.showRelationLabels} onChange={e => graph.changeSettings({ showRelationLabels: e.target.checked })} />关系类型文字</label>
          <button onClick={() => { setInspected(focus); setPanel("details"); }}>焦点详情</button>
        </div>
        {focus && projection ? <PixiGraph nodes={nodes} curves={curves} camera={camera} onCameraChange={setCamera} onNodeClick={choose}
          onRelationClick={id => { setInspected(id); setPanel("details"); }} selectedRelation={selected?.participants ? selected.id : null}
          onViewportChange={onViewport} curveStyle={curveStyle} showRelationLabels={settings.showRelationLabels}
          level={camera.zoom < 0.4 ? "far" : camera.zoom < 0.85 ? "mid" : "near"} />
          : <div className="graph-empty"><h2>从一个概念开始</h2><p>在概念库中选择焦点，或创建新的概念。</p><button className="primary" onClick={() => setLibrary(true)}>打开概念库</button></div>}
        <div className="region-caption up">上方</div><div className="region-caption down">下方</div>
        <div className="region-caption left">左侧</div><div className="region-caption right">右侧</div>
        <div className="focus-card"><span className="eyebrow">CURRENT FOCUS</span><strong>{focus ? index.get(focus).label : "尚未选择"}</strong><span>{perspective.description}</span>
          {!!projection?.related.length && <button className="related-trigger" onClick={() => setPanel("related")}>相关 · {projection.related.length} ↗</button>}
        </div>
        <div className="color-toolbar"><label>赋色轴<select aria-label="赋色轴" value={settings.colorAxis} onChange={e => graph.changeSettings({ colorAxis: e.target.value as ColorAxis })}><option value="relation">关系类型</option><option value="first-role">第一参与角色</option><option value="second-role">第二参与角色</option><option value="role-pair">前两参与角色对</option></select></label>
          <label>区分深度<select aria-label="颜色区分深度" value={settings.colorDepth} onChange={e => graph.changeSettings({ colorDepth: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <select aria-label="关系曲线样式" value={curveStyle.type} onChange={e => graph.changeSettings({ curve: { ...curveStyle, type: e.target.value as CurveStyle["type"] } })}><option value="bezier">贝塞尔</option><option value="straight">直线</option></select>
        </div>
        <div className="relation-legend" aria-label="当前赋色图例">{legend.map(l => <label key={l.key}><input aria-label={`${l.label}的颜色`} type="color" value={`#${l.color.toString(16).padStart(6, "0")}`} onChange={e => graph.changeSettings({ palette: { ...settings.palette, [l.key]: e.target.value } })} /><span>{l.label}</span></label>)}</div>
        <div className="canvas-controls"><button aria-label="缩小" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.04, c.zoom / 1.2) }))}>−</button><output>{Math.round(camera.zoom * 100)}%</output><button aria-label="放大" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(4, c.zoom * 1.2) }))}>＋</button><button onClick={recenter}>回到焦点</button><button onClick={fit}>适应邻域</button></div>
        <div className="graph-status">{nodes.length} 个显示概念 · {curves.length} 条连接投影 <span>全库 {index.concepts.length} 概念 / {relationCount} 关系实例</span>{!!projection?.omitted && <span className="limit-note">邻域显示上限 {projection.budget}，另有 {projection.omitted} 个已发现概念；搜索可聚焦完整概念库。</span>}</div>
      </section>
      {panel && <aside className="inspector"><header><div><span className="eyebrow">{panel === "settings" ? "MAKE IT YOURS" : "CONCEPT ATLAS"}</span><h2>{({ settings: "布局与背景", perspective: "视角配置", related: "收起的相关关系", details: "概念详情" })[panel]}</h2></div><button aria-label="关闭侧面板" onClick={() => setPanel(null)}>×</button></header>
        {panel === "settings" ? <ViewSettings adapter={adapter} settings={settings} view={view} index={index} onChange={graph.changeSettings} onError={graph.reportError} />
          : panel === "perspective" ? <PerspectiveControls index={index} settings={settings} onChange={graph.changeSettings} />
          : panel === "related" ? <div className="inspector-body"><p className="muted">这些关系属于完整图谱，可临时展开查看。主轴位置保持稳定。</p>{projection?.related.map(item => {
              const r = index.get(item.relationId);
              return <section key={r.id}><h4>{index.typeLabel(r)}</h4><strong>{r.label}</strong><p className="muted">关联：{item.anchors.map(id => index.get(id).label).join("、")}</p><div className="detail-actions">
                <button onClick={() => { setInspected(r.id); setPanel("details"); }}>查看详情</button>
                <button className="primary" onClick={() => { setRevealed(old => new Set([...old, r.id])); setInspected(r.id); }}>临时展开</button></div></section>;
            })}{!projection?.related.length && <p>当前没有收起的关系。</p>}</div>
          : selected ? <div className="inspector-body"><span className="type-badge">{index.typeLabel(selected)}</span><h3>{selected.label}</h3><p>{selected.description || "可以添加说明，记录这个概念的含义与背景。"}</p>
            <div className="detail-actions"><button className="primary" onClick={() => choose(selected.id)}>作为焦点</button><button onClick={() => openEditor(selected)}>编辑</button></div>
            {selected.participants && <section><h4>参与概念 · {selected.participants.length}</h4>{selected.participants.map(p => <button className="participant-link" key={p.id} onClick={() => choose(p.concept)}><span>{index.roleLabel(p.role)}</span><strong>{index.get(p.concept).label}</strong><span>↗</span></button>)}
              <button onClick={() => toggleExpanded(selected.id)}>{settings.expandedRelations.includes(selected.id) ? "压缩关系表示" : "展开为关系节点"}</button><p className="muted">多元关系保留枢纽；二元关系可以在线与节点间切换，身份不变。</p></section>}
            {!!index.relations(selected.id).length && <section><h4>参与的关系 · {index.relations(selected.id).length}</h4>{index.relations(selected.id).map(r => <button className="related-item" key={r.id} onClick={() => { setInspected(r.id); }}>{r.label}<small>{index.typeLabel(r)}</small></button>)}</section>}
            <section><h4>类型与上级</h4>{[...selected.types, ...(selected.broader ?? [])].map((id, i) => <button className="inline-link" key={`${id}:${i}`} onClick={() => choose(id)}>{index.get(id).label} ↗</button>)}</section>
            {selected.properties && Object.entries(selected.properties).map(([key, value]) => <p className="property" key={key}><span>{key}</span><strong>{typeof value === "string" ? value : JSON.stringify(value)}</strong></p>)}
            <details><summary>概念 UUID</summary><code className="uuid">{selected.id}</code></details>
            <button className="danger-text" disabled={graph.pending > 0 || coreVocabulary.has(selected.id)} onClick={() => void deleteSelected()}>删除此概念</button>
          </div> : <p className="empty-state">选择一个概念或点击一条关系线。</p>}
      </aside>}
    </div>
    {editor && <ConceptEditor key={editor.initial?.id ?? editor.mode} index={index} initial={editor.initial} mode={editor.mode} focus={focus} busy={graph.pending > 0} onSave={saveConcept} onClose={() => setEditor(null)} />}
    {help && <div className="modal-scrim" onClick={() => setHelp(false)}><section className="help-dialog" role="dialog" aria-modal="true" aria-label="键盘帮助" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setHelp(false)}>关闭</button><span className="eyebrow">FIND YOUR FLOW</span><h2>用键盘探索概念</h2><p>方向键沿屏幕方位切换焦点；Backspace 返回上一焦点。</p><dl><dt>/</dt><dd>搜索概念</dd><dt>Enter</dt><dd>编辑焦点</dd><dt>N</dt><dd>新建概念</dd><dt>R</dt><dd>新建关系</dd><dt>?</dt><dd>显示帮助</dd><dt>Esc</dt><dd>关闭面板</dd></dl><p>拖动平移，滚轮或双指缩放。点击关系线检查关系概念。</p></section></div>}
  </main>;
}

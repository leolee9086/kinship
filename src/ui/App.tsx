/** 通用概念工作台。布局、领域和存储后端各有边界，UI 只调用 DataAdapter。 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { DataAdapter } from "../adapter/api";
import type { Concept, ConceptSnapshot } from "../domain/concepts";
import { ConceptIndex } from "../domain/conceptIndex";
import { ConceptCatalog, type CatalogLifecycle } from "../domain/conceptCatalog";
import { explorationExclusions } from "../domain/lifecycle";
import { ConceptDetails } from "./ConceptDetails";
import { LifecycleNotice } from "./LifecycleNotice";
import { useConceptLifecycle } from "./useConceptLifecycle";
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
import { GraphPackageImport } from "./GraphPackageImport";
import { ConceptDeletion } from "./ConceptDeletion";
import { ConceptLibraryList } from "./ConceptLibraryList";
import { useConceptGraph } from "./useConceptGraph";
import { useWorkspacePanels } from "./useWorkspacePanels";
import "./app.css";
import "./workspace.css";
import "./deletion.css";
import "./lifecycle.css";

type GraphState = ReturnType<typeof useConceptGraph>;
interface AppProps { adapter: DataAdapter; projectControls?: (locked: boolean) => ReactNode }
export function App({ adapter, projectControls }: AppProps) {
  const graph = useConceptGraph(adapter);
  if (!graph.snapshot) return <main className="loading-screen"><span className="brand-mark">k</span><h1>Kinship</h1>
    {graph.error ? <p role="alert">{graph.error}</p> : <p>正在打开概念图谱…</p>}</main>;
  return <Workspace adapter={adapter} projectControls={projectControls} graph={graph} snapshot={graph.snapshot} />;
}

function Workspace({ adapter, projectControls, graph, snapshot }: AppProps & { graph: GraphState; snapshot: ConceptSnapshot }) {
  const settings = snapshot.settings;
  const index = useMemo(() => new ConceptIndex(snapshot.concepts), [snapshot.concepts]);
  const focus = settings.focusId;
  const [inspected, setInspected] = useState<string | null>(focus);
  const { panel, library, setPanel, setLibrary } = useWorkspacePanels();
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  useEffect(() => setRevealed(new Set()), [focus, settings.perspective.presetId]);
  const [query, setQuery] = useState("");
  const [catalogLifecycle, setCatalogLifecycle] = useState<CatalogLifecycle>("active");
  const lifecycle = useConceptLifecycle(graph.setForgotten);
  const excluded = explorationExclusions(index);
  const [tab, setTab] = useState<"instances" | "types" | "roles">("instances");
  const [editor, setEditor] = useState<{ mode: EditorMode; initial?: Concept; expectedVersion?: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const workspace = useRef<HTMLElement>(null);
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
  const visible = useMemo(() => catalog.search(tab, deferredQuery, settings.perspective, catalogLifecycle),
    [catalog, deferredQuery, tab, settings.perspective, catalogLifecycle]);
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
      if (importing || deleting || lifecycle.locked) return;
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
  const closeDeleted = () => {
    setDeleting(null); setInspected(null); setPanel(null);
    // 删除入口自身会卸载，把焦点放回稳定工作区，方便继续键盘操作。
    requestAnimationFrame(() => workspace.current?.focus());
  };
  const onViewport = useCallback((width: number, height: number) => setViewport({ width, height }), []);
  const relationCount = index.concepts.filter(c => !!c.participants).length;

  return <main ref={workspace} tabIndex={-1} className="workspace">
    <WorkspaceHeader projectControls={projectControls?.(graph.pending > 0 || Boolean(editor) || importing || Boolean(deleting) || lifecycle.locked)} library={library} settingsOpen={panel === "settings"} pending={graph.pending} error={graph.error}
      onLibrary={() => setLibrary(value => !value)} onSettings={() => setPanel(value => value === "settings" ? null : "settings")}
      onImport={() => setImporting(true)} onHelp={() => setHelp(true)} />
    {graph.error && <div className="error-banner" role="alert"><span>{graph.error}</span><button onClick={graph.clearError} aria-label="关闭错误提示">×</button></div>}
    <div className="work-area">
      <aside className={`concept-library ${library ? "is-open" : ""}`}>
        <div className="library-heading"><span className="eyebrow">YOUR CONCEPT ATLAS</span><h2>概念图谱 <span>{index.concepts.length}</span></h2></div>
        <label className="search-field"><span>⌕</span><input ref={search} aria-label="搜索概念" placeholder="搜索概念、类型或别名" value={query} onChange={e => setQuery(e.target.value)} /><kbd>/</kbd></label>
        <label className="lifecycle-filter">显示<select aria-label="概念生命周期" value={catalogLifecycle} onChange={event => setCatalogLifecycle(event.target.value as CatalogLifecycle)}>
          <option value="active">当前概念</option><option value="forgotten">已遗忘</option><option value="all">全部</option></select></label>
        <div className="library-tabs" role="group" aria-label="概念类别">{([['instances', '概念'], ['types', '类型'], ['roles', '角色']] as const).map(([id, text]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{text}</button>)}</div>
        <ConceptLibraryList concepts={visible} index={index} focus={focus} onChoose={choose} category={tab === "types" ? "类型概念" : tab === "roles" ? "角色概念" : "实例概念"} />
        <div className="library-footer"><button className="primary" onClick={() => setEditor({ mode: "concept" })}>＋ 新建概念</button><button onClick={() => setEditor({ mode: "relation" })}>新建关系</button>
          <div><button onClick={() => setEditor({ mode: "type" })}>＋ 类型</button><button onClick={() => setEditor({ mode: "role" })}>＋ 角色</button></div></div>
      </aside>
      <section className="graph-stage" aria-label="概念工作区">
        <Background adapter={adapter} settings={settings.background} onError={graph.reportError} />
        <div className="graph-toolbar"><label className="view-select"><span>视角</span><select aria-label="视角" value={settings.perspective.presetId} onChange={e => graph.changeSettings({ perspective: { ...settings.perspective, presetId: e.target.value } })}>{settings.perspective.presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <button onClick={() => setPanel("perspective")}>配置视角</button>
          <button disabled={!focus} onClick={() => { setInspected(focus); setPanel("details"); }}>焦点详情</button>
        </div>
        {focus && projection ? <PixiGraph nodes={nodes} curves={curves} camera={camera} onCameraChange={setCamera} onNodeClick={choose}
          onRelationClick={id => { setInspected(id); setPanel("details"); }} selectedRelation={selected?.participants ? selected.id : null}
          onViewportChange={onViewport} curveStyle={curveStyle} showRelationLabels={settings.showRelationLabels}
          level={camera.zoom < 0.4 ? "far" : camera.zoom < 0.85 ? "mid" : "near"} />
          : <div className="graph-empty"><h2>从一个概念开始</h2><p>在概念库中选择焦点，或创建新的概念。</p><button className="primary" onClick={() => setLibrary(true)}>打开概念库</button></div>}
        <div className="region-caption up">上方</div><div className="region-caption down">下方</div>
        <div className="region-caption left">左侧</div><div className="region-caption right">右侧</div>
        {focus && <div className="focus-card"><span className="eyebrow">CURRENT FOCUS</span><strong>{index.get(focus).label}</strong><span>{index.get(focus).forgotten ? "已遗忘：当前仅查看此概念，可在详情恢复。" : excluded.has(focus) ? "参与引用包含已遗忘概念，画布暂不展开此关系。" : perspective.description}</span>
          {!!projection?.related.length && <button className="related-trigger" onClick={() => setPanel("related")}>相关 · {projection.related.length} ↗</button>}
        </div>}
        <div className="canvas-controls"><button aria-label="缩小" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.04, c.zoom / 1.2) }))}>−</button><output>{Math.round(camera.zoom * 100)}%</output><button aria-label="放大" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(4, c.zoom * 1.2) }))}>＋</button><button onClick={recenter}>回到焦点</button><button onClick={fit}>适应邻域</button></div>
        <div className="graph-status">{nodes.length} 个显示概念 · {curves.length} 条连接投影 <span>全库 {index.concepts.length} 概念 / {relationCount} 关系实例</span>{!!projection?.omitted && <span className="limit-note">邻域显示上限 {projection.budget}，另有 {projection.omitted} 个已发现概念；搜索可聚焦完整概念库。</span>}</div>
      </section>
      {panel && <aside className="inspector"><header><div><span className="eyebrow">{panel === "settings" ? "MAKE IT YOURS" : "CONCEPT ATLAS"}</span><h2>{({ settings: "展示设置", perspective: "视角配置", related: "收起的相关关系", details: "概念详情" })[panel]}</h2></div><button aria-label="关闭侧面板" onClick={() => setPanel(null)}>×</button></header>
        {panel === "settings" ? <ViewSettings adapter={adapter} settings={settings} view={view} index={index} legend={legend} onChange={graph.changeSettings} onError={graph.reportError} />
          : panel === "perspective" ? <PerspectiveControls index={index} settings={settings} onChange={graph.changeSettings} />
          : panel === "related" ? <div className="inspector-body"><p className="muted">这些关系属于完整图谱，可临时展开查看。主轴位置保持稳定。</p>{projection?.related.map(item => {
              const r = index.get(item.relationId);
              return <section key={r.id}><h4>{index.typeLabel(r)}</h4><strong>{r.label}</strong><p className="muted">关联：{item.anchors.map(id => index.get(id).label).join("、")}</p><div className="detail-actions">
                <button onClick={() => { setInspected(r.id); setPanel("details"); }}>查看详情</button>
                <button className="primary" onClick={() => { setRevealed(old => new Set([...old, r.id])); setInspected(r.id); }}>临时展开</button></div></section>;
            })}{!projection?.related.length && <p>当前没有收起的关系。</p>}</div>
          : selected ? <ConceptDetails adapter={adapter} index={index} concept={selected} version={snapshot.conceptVersions[selected.id]} busy={graph.pending > 0}
            locked={lifecycle.locked} expanded={settings.expandedRelations.includes(selected.id)} actions={{ focus: choose, edit: openEditor, inspect: setInspected,
              toggleExpanded, deleteConcept: setDeleting, lifecycle: lifecycle.change, reportError: graph.reportError }} />
            : <p className="empty-state">选择一个概念或点击一条关系线。</p>}
      </aside>}
    </div>
    <LifecycleNotice action={lifecycle} refreshing={graph.pending > 0} onRefresh={() => { void graph.reload().then(() => { lifecycle.dismiss(); requestAnimationFrame(() => workspace.current?.focus()); })
      .catch(() => { /* reload 已经通过工作区错误栏报告失败，保留原操作反馈。 */ }); }}
      onDismiss={() => { lifecycle.dismiss(); requestAnimationFrame(() => workspace.current?.focus()); }} />
    {deleting && <ConceptDeletion key={deleting} adapter={adapter} id={deleting} onDelete={graph.deleteConcept} onClose={() => setDeleting(null)} onDeleted={closeDeleted} />}
    {importing && <GraphPackageImport adapter={adapter} onImport={graph.importGraph} onClose={() => setImporting(false)} />}
    {editor && <ConceptEditor key={editor.initial?.id ?? editor.mode} index={index} initial={editor.initial} mode={editor.mode} focus={focus} busy={graph.pending > 0} onSave={saveConcept} onClose={() => setEditor(null)} />}
    {help && <div className="modal-scrim" onClick={() => setHelp(false)}><section className="help-dialog" role="dialog" aria-modal="true" aria-label="键盘帮助" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setHelp(false)}>关闭</button><span className="eyebrow">FIND YOUR FLOW</span><h2>用键盘探索概念</h2><p>方向键沿屏幕方位切换焦点；Backspace 返回上一焦点。</p><dl><dt>/</dt><dd>搜索概念</dd><dt>Enter</dt><dd>编辑焦点</dd><dt>N</dt><dd>新建概念</dd><dt>R</dt><dd>新建关系</dd><dt>?</dt><dd>显示帮助</dd><dt>Esc</dt><dd>关闭面板</dd></dl><p>拖动平移，滚轮或双指缩放。点击关系线检查关系概念。</p></section></div>}
  </main>;
}

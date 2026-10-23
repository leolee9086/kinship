/** 正文主体装配区段；适配器只接收文件句柄和文章内序号。 */
import { useEffect, useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { DocumentBody, FileBlock } from "../contracts/document";
import type { ConceptRecord } from "../contracts/commands";
import type { Concept } from "../domain/concepts";
import { newId } from "../domain/concepts";
import { newFile } from "../domain/document";
import { newColumns, readLayout } from "../sections/layout";
import { RpcError } from "../contracts/errors";
import { kramdownAdapter } from "../sections/adapters/kramdown";
import { collaborativeTextAdapter } from "../sections/adapters/collaborativeText";
import type { BlockAdapter, MountedAdapter } from "../sections/adapter";
import { useDialogFocus } from "./useDialogFocus";
import "./body.css";
const adapters: BlockAdapter[] = [kramdownAdapter, collaborativeTextAdapter];
interface Props { initial: Concept; version: number; adapter: DataAdapter; onClose(refresh: boolean): void }
function Section({ block, ownerId, ordinal, adapter, lifecycle }: { block: FileBlock; ownerId: string; ordinal: number; adapter: DataAdapter; lifecycle: Map<string, MountedAdapter> }) {
  const host = useRef<HTMLDivElement>(null), mounted = useRef<MountedAdapter | undefined>(undefined);
  const implementation = adapters.find(candidate => candidate.mode === block.mode && candidate.contentType === block.contentType);
  useEffect(() => {
    if (!implementation || !host.current) return;
    mounted.current = implementation.mode === "whole-file"
      ? implementation.mount(host.current, adapter.textFile(ownerId, block.id), ordinal)
      : implementation.mount(host.current, adapter.crdtFile(ownerId, block.id), ordinal);
    lifecycle.set(block.id, mounted.current);
    return () => { lifecycle.delete(block.id); mounted.current?.destroy(); mounted.current = undefined; };
    // 文件内容更新不重建编辑会话；文件自己的 watch 通知编辑器。序号单独更新。
  }, [ownerId, block.id, adapter, implementation]);
  useEffect(() => mounted.current?.setOrdinal(ordinal), [ordinal]);
  return <div className="body-section-editor" ref={host}>
    {!implementation && <p role="alert">尚未安装 {block.contentType} 的编辑器；文件内容保持保存在正文中。</p>}
  </div>;
}
export function BodyEditor({ initial, version, adapter, onClose }: Props) {
  const [record, setRecord] = useState<ConceptRecord>({ concept: initial, version });
  const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false), [unknown, setUnknown] = useState(false);
  const running = useRef(false);
  const pending = useRef<{ initial: Concept; body: DocumentBody; version: number; commandId: string }>();
  const lifecycle = useRef(new Map<string, MountedAdapter>()).current;
  const prepareRemount = async () => {
    const ready = (await Promise.all([...lifecycle.values()].map(editor => editor.prepareUnmount()))).every(Boolean);
    if (!ready) setError("区段中仍有未保存或未确认的修改。请先保存或重试同步；放弃文本可使用区段自己的重新读取。");
    return ready;
  };
  const handleClose = async () => {
    if (running.current || unknown) return;
    running.current = true; setSaving(true);
    try { if (await prepareRemount()) onClose(true); }
    finally { running.current = false; setSaving(false); }
  };
  const dialog = useDialogFocus(handleClose);
  useEffect(() => {
    let active = true;
    void adapter.readConcept(initial.id).then(fresh => { if (active && !running.current) setRecord(fresh); })
      .catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [adapter, initial.id]);
  const changeStructure = async (transform?: (body: DocumentBody | undefined) => DocumentBody, remount = false) => {
    if (running.current) return; running.current = true; setSaving(true); setError(null);
    try {
      if (remount && !await prepareRemount()) return;
      if (!pending.current) {
        if (!transform) return;
        const fresh = await adapter.readConcept(initial.id);
        pending.current = { initial: fresh.concept, version: fresh.version, body: transform(fresh.concept.body), commandId: newId() };
      }
      const request = pending.current;
      const commit = await adapter.saveBody(request.initial, request.body, request.version, { commandId: request.commandId });
      setRecord(commit.changes.put[0]); pending.current = undefined; setUnknown(false);
    } catch (cause) {
      const uncertain = cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN";
      setUnknown(uncertain); if (!uncertain) pending.current = undefined;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { running.current = false; setSaving(false); }
  };
  const add = (mode: "whole-file" | "crdt") => changeStructure(body => {
    const file = mode === "whole-file" ? newFile("text/x-kramdown") : newFile("text/plain", "", "crdt");
    return { format: "kinship.document", version: 2, roots: [...body?.roots ?? [], file.id], blocks: [...body?.blocks ?? [], file] };
  });
  const move = (id: string, delta: number) => changeStructure(body => {
    if (!body) throw new Error("正文不存在");
    const roots = [...body.roots], index = roots.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= roots.length) throw new Error("此区段不能继续移动");
    roots.splice(index, 1); roots.splice(target, 0, id); return { ...body, roots };
  });
  const remove = (id: string) => {
    const layout = record.concept.body?.blocks.find(block => block.id === id)?.kind === "layout";
    if (!window.confirm(layout ? "解除此布局？其内容文件会保留并恢复顺序排列。" : "删除此区段及其内容？删除会保存一个新的正文版本。")) return;
    void changeStructure(body => {
      if (!body) throw new Error("正文不存在");
      const block = body.blocks.find(item => item.id === id);
      if (!block) throw new Error("区段已不存在");
      const members = block.kind === "layout" ? readLayout(block.text).members : [];
      // 删除布局只移除它自己的文件；成员保持身份、内容及顺序。
      return { ...body, roots: body.roots.flatMap(key => key === id ? members : [key]), blocks: body.blocks.filter(item => item.id !== id) };
    }, true);
  };
  const columns = () => changeStructure(body => {
    if (!body || body.roots.length < 2) throw new Error("至少需要两个区段才能创建分栏");
    const layout = newColumns(body.roots.slice(-2));
    return { ...body, roots: [...body.roots.slice(0, -2), layout.id], blocks: [...body.blocks, layout] };
  }, true);
  const body = record.concept.body, blocks = new Map(body?.blocks.map(block => [block.id, block]));
  let ordinal = 0;
  const render = (id: string) => {
    const block = blocks.get(id); if (!block) return null;
    if (block.kind === "layout") return <div key={id} className="body-columns">{readLayout(block.text).members.map(render)}</div>;
    const index = ++ordinal;
    return <section key={block.id} className="body-section" aria-label={`区段 ${index}`}>
      <div className="body-section-heading"><strong>{index} · {block.contentType === "text/plain" ? "协作纯文本" : "Kramdown"}</strong>
        <span>{block.mode === "crdt" ? "自动同步" : "整区段保存"}</span></div>
      <Section block={block} ownerId={initial.id} ordinal={index} adapter={adapter} lifecycle={lifecycle} />
    </section>;
  };
  // 链接扩展是普通DOM事件；适配器不需要图谱导航接口。
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    const open = (event: Event) => {
      const href: unknown = (event as CustomEvent).detail?.href;
      if (typeof href !== "string") return;
      try { const url = new URL(href, document.baseURI); if (["http:", "https:", "mailto:"].includes(url.protocol)) window.open(url.href, "_blank", "noopener,noreferrer"); }
      catch { setError("链接地址无法打开"); }
    };
    element.addEventListener("kinship:open-link", open); return () => element.removeEventListener("kinship:open-link", open);
  }, [dialog]);
  const locked = saving || unknown;
  return <div className="modal-scrim" onClick={handleClose}><section ref={dialog} className="editor-dialog body-dialog" role="dialog" aria-modal="true" aria-labelledby="body-title" onClick={event => event.stopPropagation()}>
    <header><div><span className="eyebrow">DOCUMENT</span><h2 id="body-title">{initial.label} · 正文</h2></div><button onClick={handleClose} disabled={locked} aria-label="关闭正文编辑器">×</button></header>
    <div className="body-toolbar" role="toolbar" aria-label="区段结构"><button onClick={() => void add("whole-file")} disabled={locked}>＋ Kramdown 区段</button><button onClick={() => void add("crdt")} disabled={locked}>＋ 协作纯文本</button>
      <button onClick={() => void columns()} disabled={locked || (body?.roots.length ?? 0) < 2}>末两区段分栏</button></div>
    <div className="body-content" aria-busy={locked} {...(locked ? { inert: "" } : {})}>{(!body || body.roots.length === 0) && <p>正文尚无内容。添加一个区段开始编辑。</p>}{body?.roots.map((id, index) => <div key={id} className="body-root">
      <div className="body-order"><button onClick={() => void move(id, -1)} disabled={locked || index === 0} aria-label={`上移第 ${index + 1} 个区段`}>↑</button>
        <button onClick={() => void move(id, 1)} disabled={locked || index === body.roots.length - 1} aria-label={`下移第 ${index + 1} 个区段`}>↓</button>
        <button onClick={() => remove(id)} disabled={locked} aria-label={blocks.get(id)?.kind === "layout" ? `解除第 ${index + 1} 个布局` : `删除第 ${index + 1} 个区段`}>{blocks.get(id)?.kind === "layout" ? "解除布局" : "删除"}</button></div>{render(id)}</div>)}</div>
    <footer><p role="status">{unknown ? "结构提交结果尚未确认；保留原请求，请重试。" : saving ? "正在保存区段结构…" : "各区段独立保存。添加、排列和分栏会立即保存正文结构。"}</p>
      {error && <p role="alert" className="form-error">{error}</p>}<div>{unknown && <button onClick={() => void changeStructure()} disabled={saving}>重试原结构提交</button>}
        <button onClick={handleClose} disabled={locked}>关闭正文</button></div></footer>
  </section></div>;
}

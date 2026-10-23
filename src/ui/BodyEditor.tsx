/** 正文首条端到端接入：版本固定的草稿、结果不明时原命令重试、关闭后恢复焦点。 */
import { useEffect, useRef, useState } from "react";
import type { Concept } from "../domain/concepts";
import { newId } from "../domain/concepts";
import type { Commit } from "../contracts/commands";
import type { DocumentBody } from "../contracts/document";
import type { CallOptions } from "../adapter/rpcClient";
import { RpcError } from "../contracts/errors";
import { emptyDocument } from "../domain/document";
import { sameField } from "../format/fieldDiff";
import { createEditor } from "../editor/createEditor";
import { useDialogFocus } from "./useDialogFocus";
import "prosemirror-view/style/prosemirror.css";
import "./body.css";
export function BodyEditor({ initial, version, onSave, onClose }: {
  initial: Concept; version: number;
  onSave(initial: Concept, body: DocumentBody, version: number, options: CallOptions): Promise<Commit>; onClose(): void;
}) {
  const [base, setBase] = useState({ concept: initial, version });
  const [body, setBody] = useState(() => initial.body ?? emptyDocument());
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [unknown, setUnknown] = useState(false);
  const [conflict, setConflict] = useState(false), [error, setError] = useState<string | null>(null);
  const pending = useRef<{ initial: Concept; body: DocumentBody; version: number; commandId: string } | null>(null), running = useRef(false);
  const [status, setStatus] = useState("输入正文，按 Ctrl / ⌘+Enter 保存。");
  const originalDraft = useRef(body);
  const host = useRef<HTMLDivElement>(null), editor = useRef<ReturnType<typeof createEditor> | null>(null);
  const locked = saving || unknown || conflict;
  const current = useRef({ locked, save: () => {}, changed: (_body: DocumentBody) => {} });
  const close = () => {
    if (running.current || unknown) return;
    if (!dirty || window.confirm("正文有未保存的修改，确定放弃并关闭？")) onClose();
  };
  const dialog = useDialogFocus(close);
  const save = async () => {
    if (running.current || conflict || (!dirty && !pending.current)) return;
    const request = pending.current ?? { initial: base.concept, body: structuredClone(body), version: base.version, commandId: newId() };
    pending.current = request; running.current = true; setSaving(true); setError(null);
    try {
      const commit = await onSave(request.initial, request.body, request.version, { commandId: request.commandId });
      const record = commit.changes.put[0]; setBase({ concept: record.concept, version: record.version });
      pending.current = null; setUnknown(false); setDirty(false); setStatus(`已保存 · 版本 ${record.version}`);
    } catch (cause) {
      const uncertain = cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN";
      setUnknown(uncertain); setConflict(cause instanceof RpcError && cause.fault.code === "VERSION_CONFLICT");
      if (!uncertain) pending.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { running.current = false; setSaving(false); }
  };
  current.current = { locked, save: () => { void save(); }, changed: next => {
    setBody(next); setDirty(!sameField(next, base.concept.body ?? originalDraft.current)); setError(null);
  } };
  useEffect(() => {
    if (!host.current) return;
    const instance = createEditor(host.current, body, { locked: () => running.current || current.current.locked,
      save: () => current.current.save(), changed: next => current.current.changed(next), error: message => setError(message) });
    editor.current = instance; instance.view.focus();
    return () => { editor.current = null; instance.destroy(); };
    // 一个草稿会话只创建一次编辑器；保存和锁定状态经ref读取，避免重新挂载丢失选区。
  }, []);
  useEffect(() => { editor.current?.refreshEditable(); }, [locked]);
  const controls = [["b", "加粗"], ["i", "斜体"], ["d", "删除线"], ["e", "行内代码"], ["paragraph", "段落"],
    ["heading", "标题"], ["codeblock", "代码块"], ["quote", "引用块"], ["divider", "分隔线"], ["z", "撤销"], ["y", "重做"]];
  return <div className="modal-scrim" onClick={close}><section ref={dialog} className="editor-dialog body-dialog" role="dialog" aria-modal="true" aria-labelledby="body-title" onClick={event => event.stopPropagation()}>
    <header><div><span className="eyebrow">DOCUMENT</span><h2 id="body-title">{base.concept.label} · 正文</h2></div><button disabled={saving || unknown} onClick={close} aria-label="关闭正文编辑器">×</button></header>
    <div className="body-toolbar" role="toolbar" aria-label="正文格式">{controls.map(([key, label]) => <button key={key} disabled={locked} onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.command(key)}>{label}</button>)}</div>
    <div className="body-content" ref={host} />
    <footer><p role="status">{unknown ? "提交结果不明；保留草稿和原命令，请重试。" : conflict ? "内容版本已变化；草稿保留，请复制后重新打开审阅。" : saving ? "正在保存…" : dirty ? "有未保存的正文修改" : status}</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div><button disabled={saving || unknown} onClick={close}>{dirty ? "关闭（放弃未保存修改）" : "关闭"}</button><button className="primary" disabled={saving || conflict || (!dirty && !unknown)} onClick={() => unknown ? void save() : editor.current?.command("s")}>{unknown ? "用原命令重试" : "保存正文"}</button></div>
    </footer>
  </section></div>;
}

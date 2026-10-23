/** 删除前展示所有结构引用及个人导航影响；引用列表分页，不把大型预览全部变成DOM。 */
import { useEffect, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { DeleteReference } from "../contracts/deletion";
import { useConceptDeletion, type DeleteAction } from "./useConceptDeletion";
import { useDialogFocus } from "./useDialogFocus";
const kinds = { concept: "概念", view: "视图", perspective: "视角", navigation: "已保存状态", core: "内核定义" };
function referenceLabel(ref: DeleteReference): string {
  if (ref.path === "types") return "使用此类型";
  if (ref.path === "broader") return "上级分类";
  if (ref.path === "focusId") return "焦点";
  if (ref.path === "expandedRelations") return "展开的关系";
  if (ref.path === "primaryTypes") return "主要类型";
  if (ref.path.startsWith("participants.")) return ref.path.endsWith(".role") ? "参与角色" : "参与对象";
  if (ref.path.startsWith("schema.roles.")) return "角色数量约束";
  if (ref.path.startsWith("rules.")) return "方向布局规则";
  if (ref.path.startsWith("overrides.")) return "分类显示覆盖";
  if (ref.kind === "perspective") return "分类显示规则";
  return "受保护的语义根";
}
export function ConceptDeletion({ adapter, id, onDelete, onClose, onDeleted }: {
  adapter: DataAdapter; id: string; onDelete: DeleteAction; onClose: () => void; onDeleted: () => void;
}) {
  const form = useConceptDeletion(adapter, id, onDelete), [page, setPage] = useState(0);
  const locked = (form.busy && Boolean(form.preview)) || form.uncertain, close = () => { if (!locked) (form.finished ? onDeleted : onClose)(); };
  const dialog = useDialogFocus(close), preview = form.preview;
  useEffect(() => setPage(0), [preview]);
  const refs = preview?.blockers ?? [], pages = Math.max(1, Math.ceil(refs.length / 50));
  return <div className="modal-scrim"><section ref={dialog} className="editor-dialog deletion-dialog" role="dialog" aria-modal="true" aria-label="删除概念预览">
    <header className="panel-header"><div><span className="eyebrow">CONCEPT LIFECYCLE</span><h2>删除概念</h2></div>
      <button type="button" aria-label="关闭删除预览" disabled={locked} onClick={close}>×</button></header>
    <div className="deletion-body">
      {preview && <><h3>{preview.target.concept.label}</h3><details><summary>概念身份与版本</summary><code className="uuid">{id}</code><p>概念版本 {preview.target.version} · 工作区修订 {preview.revision}</p></details>
        <p>本次移除当前记录。编辑历史与 UUID 墓碑保留；此版本暂未提供删除后的恢复界面。</p>
        {(preview.clearFocus || preview.removeExpanded) && <p>确认时将同时{[preview.clearFocus && "清除当前焦点", preview.removeExpanded && "从自己的展开列表移除"].filter(Boolean).join("、")}。</p>}
        <p role="status">{preview.canDelete ? "未发现阻止删除的引用。" : `有 ${refs.length} 处引用阻止删除，请先处理后重新检查。`}</p>
        {refs.length > 0 && <><ol className="deletion-references" start={page * 50 + 1}>{refs.slice(page * 50, (page + 1) * 50).map((ref, at) =>
          <li key={page * 50 + at}><strong>{ref.label}</strong><span>{kinds[ref.kind]} · {referenceLabel(ref)}</span>
            <details><summary>引用位置</summary><code>{ref.ownerId}</code><code>{ref.path}</code></details></li>)}</ol>
          {pages > 1 && <nav className="deletion-pages" aria-label="引用清单分页"><button disabled={page === 0 || locked} onClick={() => setPage(value => value - 1)}>上一页</button>
            <span>{page + 1} / {pages} · 每页 50 项</span><button disabled={page + 1 === pages || locked} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}</>}
      </>}
      {form.busy && !preview && <p role="status">正在检查引用…</p>}
      {form.error && <p role="alert" className="form-error">{form.error}</p>}
      {form.needsRefresh && <p>状态已经变化，请重新检查后再确认。</p>}
      {form.uncertain && <p>尚未确认提交结果。请重试原删除命令核对结果。<code className="uuid">{form.commandId}</code></p>}
      {form.finished && <p role="status">已删除该概念，其他概念与关系保持原样。</p>}
      <footer className="deletion-actions">{form.finished ? <button className="primary" onClick={close}>完成</button> : <>
        <button disabled={locked} onClick={close}>取消</button><button disabled={locked} onClick={form.refresh}>重新检查引用</button>
        <button className="danger-text" disabled={form.busy || (!form.uncertain && (!preview?.canDelete || form.needsRefresh))} onClick={() => void form.submit()}>
          {form.busy ? "正在处理…" : form.uncertain ? "重试原删除命令" : "确认删除"}</button></>}</footer>
    </div>
  </section></div>;
}

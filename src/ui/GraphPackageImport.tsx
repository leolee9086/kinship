/** 文件选择→只读预览→逐项决策→原子提交。和图谱渲染/设置面板分开维护。 */
import type { DataAdapter } from "../adapter/api";
import { usePackageImport, type ImportAction } from "./usePackageImport";
import { ImportComparison } from "./ImportComparison";
import { useDialogFocus } from "./useDialogFocus";
const actions = { create: "新增", identical: "内容相同", conflict: "内容冲突", blocked: "不能导入" };
const externalStatus = { matched: "已匹配", changed: "内容已变化", missing: "目标库缺失", blocked: "身份不可用" };
export function GraphPackageImport({ adapter, onImport, onClose }: { adapter: DataAdapter; onImport: ImportAction; onClose: () => void }) {
  const dialog = useDialogFocus(), form = usePackageImport(adapter, onImport), locked = form.busy || form.uncertain || Boolean(form.finished);
  const preview = form.data?.preview, incoming = new Map(form.data?.package.concepts.map(record => [record.concept.id, record.concept]));
  return <div className="modal-scrim"><section ref={dialog} className="editor-dialog package-import" role="dialog" aria-modal="true" aria-label="导入局部图谱"
    onKeyDown={event => { if (event.key === "Escape" && !form.busy && !form.uncertain) { event.stopPropagation(); onClose(); } }}>
    <header className="panel-header"><div><span className="eyebrow">GRAPH PACKAGE</span><h2>导入局部图谱</h2></div>
      <button type="button" onClick={onClose} disabled={form.busy || form.uncertain} aria-label="关闭图谱导入">×</button></header>
    <form onSubmit={event => { event.preventDefault(); void form.submit(); }}>
      <p>按 UUID 匹配概念、完整关系及正文。采用包内内容会同时采用该概念的完整正文；媒体、设置和历史保持原样。</p>
      <label>选择 JSON 图谱包（最多 1 MiB）<input autoFocus type="file" accept=".json,application/json" disabled={locked}
        onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void form.chooseFile(file); event.currentTarget.value = ""; }}/></label>
      {preview && <>
        <p role="status">{preview.concepts.filter(item => item.action === "create").length} 个新增 · {preview.concepts.filter(item => item.action === "identical").length} 个相同 · {preview.concepts.filter(item => item.action === "conflict").length} 个冲突 · {preview.externals.length} 个外部引用</p>
        <button type="button" disabled={locked} onClick={() => void form.refresh()}>重新核对目标库</button>
        <ul className="package-records">{preview.concepts.map(item => <li key={item.id}>
          <strong>{item.label}</strong><span>{actions[item.action]}</span><small>{item.id}</small>
          {item.reason && <p>{item.reason}</p>}
          {item.targetConcept && <ImportComparison target={item.targetConcept} incoming={incoming.get(item.id)!} />}
          {item.action === "conflict" && <label>冲突处理：{item.label}
            <select aria-label={`冲突处理：${item.label}`} disabled={locked} value={form.conflicts[item.id] ?? ""}
              onChange={event => form.chooseConflict(item.id, event.target.value as "keep-target" | "use-incoming")}>
              <option value="" disabled>请选择如何处理</option><option value="keep-target">保留目标库内容</option><option value="use-incoming">使用包内完整内容</option>
            </select></label>}
        </li>)}</ul>
        {preview.externals.length > 0 && <><h3>范围外引用</h3><ul className="package-records">{preview.externals.map(item => <li key={item.id}>
          <strong>{item.label}</strong><span>{externalStatus[item.status]}</span><small>{item.id}</small>{item.reason && <p>{item.reason}</p>}
          {item.status === "changed" && <label><input type="checkbox" disabled={locked} checked={form.accepted.includes(item.id)}
            onChange={event => form.acceptExternal(item.id, event.target.checked)}/>接受目标库中此 UUID 的当前内容</label>}
        </li>)}</ul></>}
      </>}
      {form.error && <p className="form-error" role="alert">{form.error}</p>}
      {form.uncertain && <p>尚未确认提交结果，请重试原导入以核对结果。命令：<small>{form.commandId}</small></p>}
      {form.finished && <p role="status">导入完成，新增或更新 {form.finished.changes.put.length} 个概念。原有独立对象与未包含的资料已保留。</p>}
      <footer><button type="button" onClick={onClose} disabled={form.busy || form.uncertain}>{form.finished ? "完成" : "取消"}</button>
        {!form.finished && <button className="primary" type="submit" disabled={form.busy || (!form.ready && !form.uncertain)}>{form.busy ? "正在核对…" : form.uncertain ? "重试确认原导入结果" : "确认导入"}</button>}</footer>
    </form>
  </section></div>;
}

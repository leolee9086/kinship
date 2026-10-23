/** 作者与来源可核对的共享历史审阅；页内渲染有界，私人导航和媒体二进制不进入历史列表。 */
import { useEffect, useRef } from "react";
import type { DataAdapter } from "../adapter/api";
import { useDialogFocus } from "./useDialogFocus";
import { useHistoryReview } from "./useHistoryReview";
import { HistoryConceptComparison } from "./HistoryConceptComparison";
import "./history.css";
const changes = { created: "创建", updated: "修改", deleted: "删除" };
export function HistoryReview({ adapter, onClose }: { adapter: DataAdapter; onClose: () => void }) {
  const form = useHistoryReview(adapter), dialog = useDialogFocus(onClose), page = form.page, event = form.event;
  const selected = useRef<HTMLElement>(null);
  useEffect(() => {
    if (event) { selected.current?.scrollIntoView({ block: "start" }); selected.current?.focus({ preventScroll: true }); }
  }, [event]);
  useEffect(() => {
    // 详情异步补齐高度后再对齐一次；正在操作概念选择框时保留其键盘焦点和滚动。
    if (form.detail && document.activeElement === selected.current) selected.current?.scrollIntoView({ block: "start" });
  }, [form.detail]);
  return <div className="modal-scrim"><section ref={dialog} role="dialog" aria-modal="true" aria-label="编辑历史" className="editor-dialog history-dialog">
    <header className="panel-header"><div><span className="eyebrow">WORKSPACE HISTORY</span><h2>编辑历史</h2></div><button aria-label="关闭编辑历史" onClick={onClose}>×</button></header>
    <div className="history-body"><div className="history-toolbar"><label>每页<select aria-label="历史每页条数" disabled={form.busy} value={form.limit} onChange={e => form.resize(Number(e.target.value))}>
      <option value={1}>1 条</option><option value={5}>5 条</option><option value={10}>10 条</option><option value={25}>25 条</option></select></label>
      <button disabled={form.busy} onClick={form.refresh}>读取最新记录</button></div>
      <p className="muted">共享内容按提交顺序保留，个人焦点和导航不列入。此处可审阅历史，恢复操作将在后续提供。</p>
      {page && <p role="status">审阅截至修订 {page.atRevision} · 第 {form.pageNumber} 页 · 本页 {page.events.length} 条</p>}
      {form.busy && <p role="status">正在读取历史…</p>}
      {form.error && <div role="alert"><p>{form.error}</p><button onClick={form.retry}>重试此页</button></div>}
      {page && !page.events.length && <p>还没有共享编辑记录。新建、编辑、遗忘或导入后会在这里留下记录。</p>}
      <div className="history-content"><div className="history-feed"><ol className="history-events" aria-label="历史事件">{page?.events.map(item => <li key={item.eventId}>
        <button aria-pressed={event?.eventId === item.eventId} onClick={() => form.select(item)}>
          <strong>修订 {item.revision} · {item.concepts.length} 个概念{item.presentationChanged ? " · 展示设置" : ""}{item.mediaPublished || item.mediaRemoved ? " · 媒体" : ""}</strong>
          <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
          <span>编辑者 <code>{item.actorId}</code></span><small>{item.concepts.slice(0, 3).map(c => `${changes[c.change]}“${c.label}”`).join(" · ")}{item.concepts.length > 3 ? ` 等 ${item.concepts.length} 项` : ""}</small>
        </button></li>)}</ol>
      {page && <nav className="history-pagination" aria-label="编辑历史分页"><button disabled={form.busy || form.pageNumber === 1} onClick={form.previous}>上一页</button>
        <span>第 {form.pageNumber} 页</span><button disabled={form.busy || !page.nextCursor} onClick={form.next}>下一页</button></nav>}
      </div>{event ? <section ref={selected} tabIndex={-1} className="history-event" aria-label="所选历史事件"><h3>修订 {event.revision}</h3>
        <dl><dt>编辑者</dt><dd><code>{event.actorId}</code></dd><dt>时间</dt><dd><time dateTime={event.occurredAt}>{event.occurredAt}</time></dd>
          <dt>事件 UUID</dt><dd><code>{event.eventId}</code></dd><dt>命令 UUID</dt><dd><code>{event.commandId}</code></dd></dl>
        {event.importSource && <details><summary>导入来源</summary><pre>{JSON.stringify(event.importSource, null, 2)}</pre></details>}
        {event.presentationChanged && <p>此提交修改了共享展示设置。</p>}{(event.mediaPublished > 0 || event.mediaRemoved > 0) && <p>发布媒体 {event.mediaPublished} 项，移除媒体 {event.mediaRemoved} 项。</p>}
        {event.concepts.length ? <><label>审阅概念<select aria-label="历史概念" value={form.conceptId} onChange={e => form.setConceptId(e.target.value)}>
          {event.concepts.map(c => <option key={c.id} value={c.id}>{changes[c.change]} · {c.label} · {c.id}</option>)}</select></label>
          {form.reading && <p role="status">正在读取概念前后值…</p>}{form.detailError && <div role="alert"><p>{form.detailError}</p><button onClick={form.retryDetail}>重试概念详情</button></div>}
          {form.detail && form.detail.eventId === event.eventId && form.detail.resource.id === form.conceptId && <HistoryConceptComparison detail={form.detail} />}</> : <p>本次没有修改概念记录。</p>}
      </section> : <p className="history-placeholder">选择一条记录，查看作者、来源和概念前后值。</p>}</div>
    </div>
  </section></div>;
}

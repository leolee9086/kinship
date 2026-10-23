/** 可恢复动作的持久页面反馈；结果不明不能关闭或换项目，只能核对原命令。 */
import type { useConceptLifecycle } from "./useConceptLifecycle";
export function LifecycleNotice({ action, onDismiss, onRefresh, refreshing }: {
  action: ReturnType<typeof useConceptLifecycle>; onDismiss: () => void; onRefresh: () => void; refreshing: boolean;
}) {
  if (!action.target) return null;
  const verb = action.target.forgotten ? "遗忘" : "恢复";
  return <aside className="lifecycle-notice" aria-label="生命周期操作结果">
    {action.busy ? <p role="status">正在{verb}“{action.target.label}”…</p>
      : action.error ? <p role="alert">{action.error}</p> : <p role="status">已{verb}“{action.target.label}”。UUID、内容和参与槽均保留。</p>}
    {action.uncertain && <p>尚未确认结果，请重试原命令。<code>{action.commandId}</code></p>}
    <div>{action.uncertain ? <button disabled={action.busy} onClick={action.retry}>重试原{verb}命令</button>
      : action.finished && <button disabled={action.busy} onClick={action.undo}>撤销{verb}</button>}
      {action.error && !action.uncertain && <button disabled={action.busy || refreshing} onClick={onRefresh}>{refreshing ? "正在重新读取…" : "重新读取项目"}</button>}
      {!action.uncertain && <button disabled={action.busy || refreshing} aria-label="关闭生命周期提示" onClick={onDismiss}>关闭</button>}</div>
  </aside>;
}

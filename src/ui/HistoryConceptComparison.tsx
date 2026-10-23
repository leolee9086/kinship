/** 历史前后值使用事件里的完整记录；UUID 显式可见，不用当前名称替代过去内容。 */
import type { HistoryConcept } from "../contracts/history";
import type { Concept } from "../domain/concepts";
import { sameField } from "../format/fieldDiff";
const labels: Record<keyof Concept, string> = { id: "UUID", label: "名称", forgotten: "遗忘标记", aliases: "别名", description: "说明",
  types: "类型 UUID", broader: "上级 UUID", participants: "完整参与槽", schema: "约束与样式", properties: "属性" };
const text = (value: unknown) => value === undefined ? "未设置" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
export function HistoryConceptComparison({ detail }: { detail: HistoryConcept }) {
  const before = detail.before?.concept, after = detail.after?.concept;
  const fields = (Object.keys(labels) as (keyof Concept)[]).filter(key => !sameField(before?.[key], after?.[key]));
  return <section className="history-comparison" aria-label="历史概念前后对比"><h3>{detail.resource.label}</h3>
    <code className="uuid">{detail.resource.id}</code>
    <p>{detail.before ? `修改前版本 ${detail.before.version}` : "修改前不存在"} · {detail.after ? `修改后版本 ${detail.after.version}` : `删除后墓碑版本 ${detail.resource.afterVersion}`}</p>
    {fields.length ? fields.map(key => <section className="history-field" key={key}><h4>{labels[key]}</h4><div>
      <section><span>修改前</span><pre>{before ? text(before[key]) : "概念尚未创建"}</pre></section>
      <section><span>修改后</span><pre>{after ? text(after[key]) : "当前记录已删除，历史前值保留"}</pre></section>
    </div></section>) : <p>本次只推进资源版本，没有字段内容变化。</p>}
    <details><summary>完整历史记录</summary><pre>{JSON.stringify({ before: detail.before, after: detail.after }, null, 2)}</pre></details>
    <p className="muted">以上为此事件保存的历史值。恢复影响预览与执行将在下一切片提供。</p>
  </section>;
}

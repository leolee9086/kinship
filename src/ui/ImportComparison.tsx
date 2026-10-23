/** 只展示真正不同的字段，提交前可检查完整记录选择的效果。 */
import type { Concept } from "../domain/concepts";
import { sameField } from "../format/fieldDiff";
const labels: Record<keyof Concept, string> = { id: "身份", label: "名称", aliases: "别名", description: "说明", types: "类型",
  broader: "上级", properties: "属性", schema: "约束与样式", participants: "参与槽" };
const text = (value: unknown) => value === undefined ? "未设置" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
export function ImportComparison({ target, incoming }: { target: Concept; incoming: Concept }) {
  const keys = Object.keys(labels) as (keyof Concept)[];
  return <details><summary>查看冲突字段</summary>{keys.filter(key => !sameField(target[key], incoming[key])).map(key => <section className="import-comparison" key={key}>
    <h4>{labels[key]}</h4><span>目标库</span><pre>{text(target[key])}</pre><span>包内内容</span><pre>{text(incoming[key])}</pre>
  </section>)}</details>;
}

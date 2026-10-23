/** 低频显示偏好归入侧栏；画布只保留当前上下文与导航，不堆叠设置浮层。 */
import type { ColorAxis, GraphSettings } from "../domain/concepts";
export interface LegendEntry { key: string; label: string; color: number }
export function DisplaySettings({ settings, legend, onChange }: { settings: GraphSettings; legend: LegendEntry[];
  onChange: (patch: Partial<GraphSettings>) => void }) {
  return <>
    <section><h3>显示内容</h3>
      <label>邻域深度<select aria-label="邻域深度" value={settings.depth} onChange={event => onChange({ depth: Number(event.target.value) })}>{[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} 跳</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={settings.showRelationLabels} onChange={event => onChange({ showRelationLabels: event.target.checked })}/>显示关系类型文字</label>
      <label>关系连线<select aria-label="关系曲线样式" value={settings.curve.type} onChange={event => onChange({ curve: { ...settings.curve, type: event.target.value as GraphSettings["curve"]["type"] } })}><option value="bezier">贝塞尔曲线</option><option value="straight">直线</option></select></label>
    </section>
    <section><h3>颜色与图例</h3>
      <label>赋色轴<select aria-label="赋色轴" value={settings.colorAxis} onChange={event => onChange({ colorAxis: event.target.value as ColorAxis })}><option value="relation">关系类型</option><option value="first-role">第一参与角色</option><option value="second-role">第二参与角色</option><option value="role-pair">前两参与角色对</option></select></label>
      <label>区分深度<select aria-label="颜色区分深度" value={settings.colorDepth} onChange={event => onChange({ colorDepth: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <div className="settings-legend" aria-label="当前赋色图例">{legend.map(entry => <label key={entry.key}><input aria-label={`${entry.label}的颜色`} type="color" value={`#${entry.color.toString(16).padStart(6, "0")}`} onChange={event => onChange({ palette: { ...settings.palette, [entry.key]: event.target.value } })}/><span>{entry.label}</span></label>)}</div>
    </section>
  </>;
}

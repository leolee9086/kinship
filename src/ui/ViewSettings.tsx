/** 可保存的视图规则与背景上传。所有媒体操作只调用 DataAdapter。 */
import { useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { GraphSettings, GraphView, Region, MediaInfo } from "../domain/concepts";
import type { ConceptIndex } from "../domain/conceptIndex";
const regions: { value: Region; label: string }[] = [{ value: "up", label: "上" }, { value: "down", label: "下" }, { value: "left", label: "左" }, { value: "right", label: "右" }];

export function ViewSettings({ adapter, settings, view, index, onChange, onError }: {
  adapter: DataAdapter; settings: GraphSettings; view: GraphView; index: ConceptIndex;
  onChange: (patch: Partial<GraphSettings>) => void; onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<MediaInfo | null>(null);
  const changeBackground = (patch: Partial<GraphSettings["background"]>) => onChange({ background: { ...settings.background, ...patch } });
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const media = await adapter.upload(file);
      setUploaded(media); changeBackground({ mediaId: media.id, paused: false });
    } catch (error) { onError(String(error)); }
    finally { setUploading(false); }
  };
  const clear = async () => {
    if (!settings.background.mediaId) return;
    setUploading(true);
    try {
      const next = await adapter.removeMedia(settings.background.mediaId);
      onChange({ background: next.background }); setUploaded(null);
    } catch (error) { onError(String(error)); }
    finally { setUploading(false); }
  };
  return <div className="settings-body">
    <section><span className="eyebrow">SPACING & LAYOUT</span><h3>四向概念距离</h3><p className="muted">从文字框边缘计算；调整一个方向，不改变其他方向的基准间距。</p>
      {regions.map(r => <label key={r.value}>{r.label}方间距 <output>{settings.regionGaps[r.value]}px</output><input aria-label={`${r.label}方概念间距`} type="range" min="24" max="480" step="4" value={settings.regionGaps[r.value]} onChange={e => onChange({ regionGaps: { ...settings.regionGaps, [r.value]: Number(e.target.value) } })} /></label>)}
      <label>次要内容强度 <output>{Math.round(settings.dimOpacity * 100)}%</output><input aria-label="次要内容强度" type="range" min="0.01" max="0.3" step="0.005" value={settings.dimOpacity} onChange={e => onChange({ dimOpacity: Number(e.target.value) })} /></label>
    </section>
    <section><span className="eyebrow">APPEARANCE</span><h3>让图谱融入你的空间</h3>
      <label className={`upload-zone ${uploading ? "disabled" : ""}`}>
        <span className="upload-symbol">↥</span><strong>{uploading ? "正在上传…" : "上传背景图片或视频"}</strong>
        <span>PNG · JPEG · WebP · MP4 · WebM · 最大 100 MiB</span>
        <input aria-label="上传背景图片或视频" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,video/ogg" disabled={uploading}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
      </label>
      {uploaded && <p className="muted">{uploaded.name} · {(uploaded.size / 1024 / 1024).toFixed(2)} MiB</p>}
      <label>背景强度 <output>{Math.round(settings.background.opacity * 100)}%</output><input aria-label="背景强度" type="range" min="0" max="1" step="0.01" value={settings.background.opacity} onChange={e => changeBackground({ opacity: Number(e.target.value) })} /></label>
      <label>背景模糊 <output>{settings.background.blur}px</output><input aria-label="背景模糊" type="range" min="0" max="24" step="1" value={settings.background.blur} onChange={e => changeBackground({ blur: Number(e.target.value) })} /></label>
      <label className="check"><input type="checkbox" checked={settings.background.paused} onChange={e => changeBackground({ paused: e.target.checked })} />暂停视频背景</label>
      <p className="muted">视频静音循环；页面在后台或系统要求减少动画时暂停。</p>
      <button disabled={uploading || !settings.background.mediaId} onClick={() => void clear()}>移除背景</button>
    </section>
    <section><span className="eyebrow">SEMANTIC LAYOUT</span><h3>方向布局</h3><p className="muted">方向规则相对当前焦点阅读。连线按两端的实际位置选择出入口。</p>
      <label>方向布局预设<select aria-label="方向布局预设" value={settings.viewId} onChange={e => onChange({ viewId: e.target.value })}>{settings.views.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      {view.rules.map(rule => <label className="rule-row" key={rule.id}><span>{index.get(rule.relationType).label}{rule.focusRole && <small>焦点角色：{index.get(rule.focusRole).label}</small>}</span>
        <select aria-label={`${rule.id} 的展示方向`} value={settings.regionOverrides[rule.id] ?? rule.region} onChange={e => onChange({ regionOverrides: { ...settings.regionOverrides, [rule.id]: e.target.value as Region } })}>
          {regions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select></label>)}
      <button onClick={() => onChange({ regionOverrides: {} })}>恢复视图默认方向</button>
    </section>
  </div>;
}

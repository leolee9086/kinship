/** 导出先查看范围，再下载固定快照；文件生成的数据来自适配器，不从画布猜完整事实。 */
import { useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { GraphPackage } from "../contracts/graphPackage";
import { canonicalJSON } from "../format/json";

export function GraphPackageExport({ adapter, conceptId, disabled, onError }: {
  adapter: DataAdapter; conceptId: string; disabled: boolean; onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<GraphPackage["mode"]>("standalone");
  const [preview, setPreview] = useState<GraphPackage | null>(null), [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true); setPreview(null);
    try { setPreview(await adapter.exportGraph({ selected: [conceptId], entrypoints: [conceptId], mode })); }
    catch (error) { onError(error instanceof Error ? error.message : "局部图谱导出失败"); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([canonicalJSON(preview)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `kinship-${conceptId}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="导出局部图谱"><h4>保存局部图谱</h4>
    <p className="muted">带走此概念或完整关系，以及必要的类型和角色定义。不会自动扩展参与对象的其他关系。</p>
    <label>范围<select aria-label="局部图谱导出范围" value={mode} disabled={busy} onChange={event => {
      setMode(event.target.value as GraphPackage["mode"]); setPreview(null);
    }}><option value="standalone">包含必要参与对象</option><option value="boundary">保留范围外引用</option></select></label>
    <div className="detail-actions"><button disabled={busy || disabled} onClick={() => void generate()}>{busy ? "正在生成…" : "生成导出预览"}</button>
      {preview && <button className="primary" onClick={download}>下载 JSON 图谱包</button>}</div>
    {preview && <div role="status"><p>{preview.selected.length} 个所选概念 · {preview.dependencies.length} 个必要依赖 · {preview.externals.length} 个外部引用</p>
      <p className="muted">此包仅包含概念与关系；正文、媒体、展示设置和历史未包含。</p>
      {preview.externals.length > 0 && <p className="muted">导入时需要按 UUID 解析外部引用。可用顶栏“更多 → 导入图谱包”核对目标库，缺失引用会阻止提交。</p>}</div>}
  </section>;
}

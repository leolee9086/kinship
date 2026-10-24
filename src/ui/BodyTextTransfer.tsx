/** 文本导入/导出表单只调用数据适配器；不在界面解析区段、IAL 或协作状态。 */
import { useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { DocumentBody } from "../contracts/document";
import type { DocumentTextPreview } from "../contracts/documentText";
interface Props {
  adapter: DataAdapter; ownerId: string; disabled: boolean; prepare(): Promise<boolean>;
  onImport(body: DocumentBody, expectedVersion: number): Promise<boolean>;
}
export function BodyTextTransfer({ adapter, ownerId, disabled, prepare, onImport }: Props) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"text" | "file">("text");
  const [text, setText] = useState(""), [identity, setIdentity] = useState<"preserve" | "copy">("preserve");
  const [preview, setPreview] = useState<DocumentTextPreview | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [status, setStatus] = useState("");
  const locked = disabled || busy;
  const work = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setStatus("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const download = () => work(async () => {
    if (!await prepare()) return;
    const result = await adapter.exportDocumentText(ownerId);
    const url = URL.createObjectURL(new Blob([result.text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `kinship-body-${ownerId}.md`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`已导出保存版本 ${result.version} 的正文文本。${result.collaborative ? "协作区段再次导入时会建立新的协作状态。" : ""}`);
  });
  const check = () => work(async () => {
    setPreview(null);
    const result = source === "file"
      ? file ? (await adapter.previewDocumentTextFile(ownerId, file, identity)).preview : null
      : await adapter.previewDocumentText({ id: ownerId, text, identity });
    if (result) setPreview(result);
  });
  const apply = () => work(async () => {
    if (!preview?.candidate || !preview.added) return;
    if (await onImport(preview.candidate, preview.target.version)) {
      setText(""); setFile(null); if (fileInput.current) fileInput.current.value = "";
      setPreview(null); setOpen(false); setStatus("已追加导入，原有区段保持原顺序。");
    }
  });
  return <><details className="body-text-transfer" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>导入 / 导出区段文本</summary>
    <div className="body-text-transfer-content">
      <p>文本文件包含正文、布局和原始属性。协作区段按文本建立新状态；编辑历史另存于当前项目。</p>
      <button disabled={locked} onClick={() => void download()}>下载已保存正文文本</button>
      <fieldset disabled={locked} className="body-transfer-source"><legend>导入来源</legend>
        <label><input type="radio" name={`body-text-source-${ownerId}`} checked={source === "text"} onChange={() => { setSource("text"); setFile(null); setPreview(null); setError(null); setStatus(""); }} /> 粘贴文本</label>
        <label><input type="radio" name={`body-text-source-${ownerId}`} checked={source === "file"} onChange={() => { setSource("file"); setFile(null); setPreview(null); setError(null); setStatus(""); }} /> 选择 UTF-8 文件</label>
      </fieldset>
      {source === "text" ? <label>区段导入文本<textarea aria-label="区段导入文本" rows={4} value={text} disabled={locked} spellCheck={false}
        placeholder="粘贴 Markdown 或带分割线和 IAL 的区段文本" onChange={event => { setText(event.target.value); setPreview(null); setError(null); setStatus(""); }} /></label>
        : <label>选择 .md 或 .txt 文件<input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" disabled={locked} onChange={event => {
          setFile(event.target.files?.[0] ?? null); setPreview(null); setError(null); setStatus("");
        }} />{file && <span>{file.name} · {file.size.toLocaleString()} 字节</span>}</label>}
      <label>文件身份<select aria-label="导入文件身份" value={identity} disabled={locked} onChange={event => {
        setIdentity(event.target.value as "preserve" | "copy"); setPreview(null); setStatus("");
      }}><option value="preserve">保留文件 UUID（冲突时停止）</option><option value="copy">全部分配新 UUID（更新布局引用）</option></select></label>
      <p>支持 UTF-8 文本，最多 1 MiB。空文件可预览，不追加区段。</p>
      <div className="body-transfer-actions"><button disabled={locked || (source === "file" ? !file : !text)} onClick={() => void check()}>预览追加导入</button>
        {preview && <button disabled={locked || !preview.candidate || !preview.added} onClick={() => void apply()}>确认追加 {preview.added} 个文件</button>}</div>
      {preview && <div role="status"><p>将追加 {preview.added} 个文件，其中 {preview.layouts} 个布局、{preview.collaborative} 个协作区段；核对版本 {preview.target.version}。</p>
        {!!preview.fallback && <p>{preview.fallback} 个声明未匹配专门适配器，将保留原始属性并使用 Kramdown 编辑。</p>}
        {!!preview.collaborative && <p>协作区段只从文本初始化，不包含原协作因果状态。</p>}
        {!!preview.collisions.length && <p role="alert">{preview.collisions.length} 个文件 UUID 已占用或已留墓碑。选择全部分配新 UUID 后重新预览。</p>}</div>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  </details>{status && <p role="status" className="body-transfer-status">{status}</p>}</>;
}

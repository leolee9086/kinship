/** multipart 正文文件只读入口：先核原始字节，再严格解码，复用同一文本预览。 */
import type { Request, Result } from "../contracts/rpc";
import { MAX_DOCUMENT_TEXT_BYTES } from "../contracts/documentText";
import { fail } from "../contracts/errors";
import { sha256 } from "../format/digest";
import type { GraphRepository } from "./repository";
export async function previewDocumentTextFile(repository: GraphRepository, input: Request<"previewDocumentTextFile">, file?: File) {
  if (!file || file.name !== input.params.name || file.size !== input.params.size)
    fail("INVALID_REQUEST", "正文文本文件与声明的名称或长度不一致");
  if (file.size > MAX_DOCUMENT_TEXT_BYTES) fail("PAYLOAD_TOO_LARGE", "正文文本文件超过 1 MiB");
  const digest = await sha256(file);
  if (digest !== input.params.sha256) fail("INVALID_REQUEST", "正文文本文件的字节摘要不匹配");
  let text: string;
  // ignoreBOM 保留 U+FEFF 字面值，与粘贴入口一致；不把坏编码替换成 U+FFFD。
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
  catch { fail("INVALID_REQUEST", "正文文本文件需要有效 UTF-8 编码"); }
  const reply = await repository.previewDocumentText({ ...input, params: { id: input.params.id, identity: input.params.identity, text } });
  const result: Result<"previewDocumentTextFile"> = { source: { name: file.name, size: file.size, sha256: digest }, preview: reply.value };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2 * 1048576) fail("PAYLOAD_TOO_LARGE", "文件预览响应超过 2 MiB");
  return { result, ...reply.context };
}

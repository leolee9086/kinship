/** 对实际流字节计数，不能信任客户端 Content-Length；JSON 与二进制使用独立预算。 */
import { RpcError } from "../contracts/errors";
import { MAX_MEDIA_BYTES } from "./repository";
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
function tooLarge(): RpcError { return new RpcError({ code: "PAYLOAD_TOO_LARGE", message: "请求正文超过当前接口大小上限", retryable: false }); }
async function bytes(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("empty body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw tooLarge(); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function readJSON(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new RpcError({ code: "INVALID_REQUEST", message: "RPC 请求需要 application/json", retryable: false });
  const source = await bytes(request, MAX_JSON_BYTES);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source)); }
  catch { throw new SyntaxError("invalid JSON or UTF-8"); }
}
export async function readUpload(request: Request): Promise<{ source: unknown; file: File }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new SyntaxError("invalid multipart");
  const body = await bytes(request, MAX_MEDIA_BYTES + MAX_JSON_BYTES + 65536);
  let form: FormData;
  try { form = await new Response(body, { headers: { "content-type": contentType } }).formData(); }
  catch { throw new SyntaxError("invalid multipart"); }
  if (form.getAll("request").length !== 1 || form.getAll("file").length !== 1 || [...form.keys()].some(key => key !== "request" && key !== "file"))
    throw new SyntaxError("invalid multipart fields");
  const envelope = form.get("request"), file = form.get("file");
  if (typeof envelope !== "string" || !(file instanceof File)) throw new SyntaxError("missing envelope or file");
  if (new TextEncoder().encode(envelope).byteLength > MAX_JSON_BYTES) throw tooLarge();
  return { source: JSON.parse(envelope), file };
}

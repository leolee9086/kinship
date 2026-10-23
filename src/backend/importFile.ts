/** 文件解析与摘要核对属于后端；UI只把文件交给DataAdapter。 */
import type { Request } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { MAX_IMPORT_FILE_BYTES } from "../contracts/importPreview";
import { readGraphPackage } from "../format/graphPackage";
import { sha256 } from "../format/digest";
import type { GraphRepository } from "./repository";

export async function previewImportFile(repository: GraphRepository, input: Request<"previewImportFile">, file?: File) {
  if (!file || file.name !== input.params.name || file.size !== input.params.size || file.size > MAX_IMPORT_FILE_BYTES)
    fail("INVALID_REQUEST", "图谱包文件与声明的名称或长度不一致");
  if (await sha256(file) !== input.params.sha256) fail("INVALID_REQUEST", "图谱包文件的字节摘要不匹配");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { fail("INVALID_REQUEST", "图谱包文件需要有效 UTF-8 编码"); }
  let value: Awaited<ReturnType<typeof readGraphPackage>>;
  try { value = await readGraphPackage(text); }
  catch (cause) { fail("INVALID_REQUEST", cause instanceof Error ? cause.message : "图谱包文件内容无效"); }
  const reply = await repository.previewImport({ ...input, params: { package: value } });
  return { result: { package: value, preview: reply.value }, ...reply.context };
}

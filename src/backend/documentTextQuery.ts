/** 文本转换在后端运行；预览用同一只读快照核对目标版本和全部身份，不做业务写入。 */
import type { ConceptRecord } from "../contracts/commands";
import type { Request, Result } from "../contracts/rpc";
import { fail, RpcError } from "../contracts/errors";
import { exportDocumentText, importDocumentText } from "../format/documentText";
import { validateDocument } from "../domain/document";
import { scopedQuery, type QueryValue } from "./workspaceQueries";
import { STORES as S } from "./workspaceDb";
const size = new TextEncoder();
function bounded<T>(result: T): T {
  if (size.encode(JSON.stringify(result)).byteLength > 2 * 1048576) fail("PAYLOAD_TOO_LARGE", "文本预览或导出响应超过 2 MiB，请分批处理");
  return result;
}
function convert<T>(work: () => T): T {
  try { return work(); }
  catch (cause) {
    if (cause instanceof RpcError) throw cause;
    fail("DOMAIN_CONSTRAINT", cause instanceof Error ? cause.message : String(cause));
  }
}
export async function queryDocumentExport(db: IDBDatabase, input: Request<"exportDocumentText">): Promise<QueryValue<Result<"exportDocumentText">>> {
  return scopedQuery(db, input.workspaceId, [S.concepts], (tx, _state, done, abort) => {
    const request = tx.objectStore(S.concepts).get(input.params.id);
    request.onsuccess = () => {
      try {
        const target = request.result as ConceptRecord | undefined;
        if (!target) fail("NOT_FOUND", "概念不存在", { id: input.params.id });
        done(bounded({ id: target.concept.id, version: target.version, text: convert(() => exportDocumentText(target.concept.body)),
          collaborative: target.concept.body?.blocks.filter(block => block.mode === "crdt").length ?? 0 }));
      } catch (cause) { abort(cause); }
    };
  });
}
export function queryDocumentPreview(db: IDBDatabase, input: Request<"previewDocumentText">): Promise<QueryValue<Result<"previewDocumentText">>> {
  const imported = convert(() => importDocumentText(input.params.text, input.params.identity));
  return scopedQuery(db, input.workspaceId, [S.concepts, S.identities], (tx, _state, done, abort) => {
    let target: ConceptRecord | undefined, remaining = imported.body.blocks.length + 1;
    const collisions: string[] = [], finish = () => {
      if (--remaining) return;
      try {
        if (!target) fail("NOT_FOUND", "概念不存在", { id: input.params.id });
        const before = target.concept.body;
        // 被占用及墓碑都需要明确选择复制；纯文本导入不能暗中充当块恢复。
        const candidate = collisions.length ? null : validateDocument({ format: "kinship.document", version: 2,
          roots: [...before?.roots ?? [], ...imported.body.roots], blocks: [...before?.blocks ?? [], ...imported.body.blocks] });
        done(bounded({ target, candidate, collisions, added: imported.body.blocks.length,
          layouts: imported.body.blocks.filter(block => block.kind === "layout").length,
          fallback: imported.fallback, collaborative: imported.collaborative }));
      } catch (cause) { abort(cause); }
    };
    const request = tx.objectStore(S.concepts).get(input.params.id);
    request.onsuccess = () => { target = request.result as ConceptRecord | undefined; finish(); };
    for (const block of imported.body.blocks) {
      const identity = tx.objectStore(S.identities).get(block.id);
      identity.onsuccess = () => { if (identity.result) collisions.push(block.id); finish(); };
    }
  });
}

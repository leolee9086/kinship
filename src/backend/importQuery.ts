/** 同一只读事务读取业务记录与身份墓碑；校验与摘要在事务之外执行。 */
import type { ConceptRecord } from "../contracts/commands";
import type { Request } from "../contracts/rpc";
import { previewImport, type ImportTarget } from "../domain/importPreview";
import { readGraphPackage } from "../format/graphPackage";
import { scopedQuery, type QueryValue } from "./workspaceQueries";
import { STORES as S, type IdentityRecord } from "./workspaceDb";

export function readImportTarget(db: IDBDatabase, workspaceId: string): Promise<QueryValue<ImportTarget>> {
  return scopedQuery(db, workspaceId, [S.concepts, S.identities], (tx, _state, done) => {
    const concepts = tx.objectStore(S.concepts).getAll(), identities = tx.objectStore(S.identities).getAll();
    let pending = 2;
    const finish = () => { if (--pending === 0) done({ concepts: concepts.result as ConceptRecord[], identities: identities.result as IdentityRecord[] }); };
    concepts.onsuccess = finish; identities.onsuccess = finish;
  });
}
export async function queryImportPreview(db: IDBDatabase, input: Request<"previewImport">) {
  const value = await readGraphPackage(input.params.package);
  const snapshot = await readImportTarget(db, input.workspaceId);
  return { value: await previewImport(value, snapshot.value, snapshot.context), context: snapshot.context };
}

/** 关联到正确请求信封还不够：提交本身也必须是此次逻辑命令及其来源。 */
import { CommitSchema } from "../contracts/commands";
import type { Request } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import { canonicalJSON } from "../format/json";
export function verifyCommit(result: unknown, revision: number, commandId: string, imported?: Request<"importGraph">["params"]) {
  const commit = parse(CommitSchema, result, "INTERNAL_ERROR");
  if (commit.commandId !== commandId || commit.revision !== revision) throw new Error("commit identity or revision mismatch");
  if (imported && (!commit.importSource || commit.importSource.packageId !== imported.package.id
    || commit.importSource.packageSha256 !== imported.packageSha256
    || canonicalJSON(commit.importSource.source) !== canonicalJSON(imported.package.source)))
    throw new Error("import provenance mismatch");
}

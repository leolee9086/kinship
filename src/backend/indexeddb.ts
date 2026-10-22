/** 本地数据库实现。事实、版本、幂等结果和历史共用事务，不读取/迁移任何旧库。 */
import type { Commit } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { registry, type Method, type Request, type Role } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import type { StoredMedia } from "../domain/concepts";
import { canonicalJSON } from "../format/json";
import { sha256 } from "../format/digest";
import type { GraphRepository } from "./repository";
import { executeCommand } from "./commandTransaction";
import { openWorkspace } from "./workspaceDb";
import * as queries from "./workspaceQueries";

async function fingerprint(method: Method, input: Request<"apply"> | Request<"upload">): Promise<string> {
  return sha256(canonicalJSON({ version: input.version, operation: registry[method].path, workspaceId: input.workspaceId, params: input.params }));
}
export class IndexedDbRepository implements GraphRepository {
  private readonly opening: Promise<IDBDatabase>;
  /** role 是受信任的本地后端选项；远端实现从认证会话得到它。 */
  constructor(name = "kinship-workspaces", factory: IDBFactory = indexedDB, readonly role: Role = "administrator") {
    this.opening = openWorkspace(name, factory);
  }
  async bootstrap() { return queries.bootstrap(await this.opening, this.role); }
  async apply(source: Request<"apply">): Promise<Commit> {
    const input = parse(registry.apply.request, source);
    return executeCommand(await this.opening, { ...input, role: this.role, fingerprint: await fingerprint("apply", input) });
  }
  async upload(source: Request<"upload">, file: Blob): Promise<Commit> {
    const input = parse(registry.upload.request, source);
    if (this.role === "guest") fail("FORBIDDEN", "当前空间角色不能上传媒体");
    if (file.type !== input.params.type || file.size !== input.params.size) fail("INVALID_REQUEST", "媒体字节与声明的类型或长度不同");
    if (await sha256(file) !== input.params.sha256) fail("INVALID_REQUEST", "媒体摘要与原始字节不符");
    const info = { ...input.params, version: 1, createdAt: new Date().toISOString() };
    const attachment: StoredMedia = { ...info, blob: file };
    return executeCommand(await this.opening, { workspaceId: input.workspaceId, commandId: input.commandId,
      fingerprint: await fingerprint("upload", input), role: this.role, attachment,
      params: { operations: [{ type: "media.publish", data: info }] } });
  }
  async commandStatus(source: Request<"commandStatus">) {
    const input = parse(registry.commandStatus.request, source);
    return queries.commandStatus(await this.opening, input.workspaceId, input.params.commandId);
  }
  async events(source: Request<"events">) {
    const input = parse(registry.events.request, source);
    return queries.events(await this.opening, input.workspaceId, input.params.after, input.params.limit);
  }
  async media(workspaceId: string, id: string): Promise<queries.QueryValue<StoredMedia>> {
    const result = await queries.media(await this.opening, workspaceId, id);
    if (!result.value) fail("NOT_FOUND", "媒体不存在", { id });
    return { ...result, value: result.value };
  }
  async close(): Promise<void> { (await this.opening).close(); }
}

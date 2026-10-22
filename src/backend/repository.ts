/** 路由的后端能力边界；可信角色来自后端会话，不在 RPC 参数中接受 actorId。 */
import type { Commit } from "../contracts/commands";
import type { Bootstrap, Request, Result, Role } from "../contracts/rpc";
import type { StoredMedia } from "../domain/concepts";
import type { QueryValue } from "./workspaceQueries";
export interface GraphRepository {
  readonly role: Role;
  bootstrap(): Promise<Bootstrap>;
  apply(input: Request<"apply">): Promise<Commit>;
  upload(input: Request<"upload">, file: Blob): Promise<Commit>;
  commandStatus(input: Request<"commandStatus">): Promise<QueryValue<Result<"commandStatus">>>;
  events(input: Request<"events">): Promise<QueryValue<Result<"events">>>;
  media(workspaceId: string, id: string): Promise<QueryValue<StoredMedia>>;
  close(): Promise<void>;
}
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

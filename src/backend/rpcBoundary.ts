/** 协议包络边界；业务错误保持可判别，内部异常不泄漏细节。 */
import type { RouterContext } from "@leolee9086/sac-path-router";
import type { Static, TSchema } from "@sinclair/typebox";
import { FailureSchema, RpcError } from "../contracts/errors";
import { parse } from "../contracts/validate";
import { successSchema } from "../contracts/rpc";
import { isUUID } from "../domain/concepts";
import { InputError } from "../domain/inputValidation";

export function requestIdentity(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const id = (source as Record<string, unknown>).requestId; return isUUID(id) ? id : null;
}
export function readEnvelope<T extends TSchema>(schema: T, source: unknown): Static<T> {
  if (source && typeof source === "object" && "version" in source && source.version !== 1)
    throw new RpcError({ code: "UNSUPPORTED_VERSION", message: "不支持的 RPC 协议版本", retryable: false });
  return parse(schema, source);
}
export function success<T extends TSchema>(ctx: RouterContext, schema: T, requestId: string, result: unknown,
  workspaceId: string, revision: number): void {
  ctx.body = parse(successSchema(schema), { protocol: "kinship.rpc", version: 1, ok: true, requestId,
    result, context: { workspaceId, revision } }, "INTERNAL_ERROR");
  ctx.responseHeaders.set("content-type", "application/json; charset=utf-8");
  ctx.responseHeaders.set("x-request-id", requestId); ctx.status = 200;
}
export function failure(ctx: RouterContext, error: unknown, requestId: string | null): void {
  const fault = error instanceof RpcError ? error.fault : error instanceof InputError
    ? { code: "DOMAIN_CONSTRAINT" as const, message: error.message, retryable: false }
    : error instanceof SyntaxError
      ? { code: "INVALID_REQUEST" as const, message: "请求正文无法解析", retryable: false }
      : { code: "INTERNAL_ERROR" as const, message: "内部存储请求失败", retryable: false };
  ctx.body = parse(FailureSchema, { protocol: "kinship.rpc", version: 1, ok: false, requestId, error: fault });
  ctx.status = new RpcError(fault).status;
  ctx.responseHeaders.set("content-type", "application/json; charset=utf-8");
  if (requestId) ctx.responseHeaders.set("x-request-id", requestId);
}

/** 错误码是调用方判断依据；中文信息仅供显示，绝不用于分支或重试判断。 */
import { Type, type Static } from "@sinclair/typebox";
import { AttributesSchema, strictObject, UUIDSchema } from "./primitives";

export const ERROR_STATUS = {
  INVALID_REQUEST: 400, UNSUPPORTED_VERSION: 400, UNSUPPORTED_CAPABILITY: 422,
  NOT_AUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VERSION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409, REFERENCE_CONFLICT: 409, DOMAIN_CONSTRAINT: 422,
  CURSOR_EXPIRED: 409, PLAN_EXPIRED: 409, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429,
  TEMPORARILY_UNAVAILABLE: 503, RESULT_UNKNOWN: 503, INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export const FaultSchema = strictObject({
  code: Type.Union(Object.keys(ERROR_STATUS).map(code => Type.Literal(code as ErrorCode))),
  message: Type.String({ minLength: 1, maxLength: 4096 }), retryable: Type.Boolean(),
  details: Type.Optional(AttributesSchema),
});
export const FailureSchema = strictObject({ protocol: Type.Literal("kinship.rpc"), version: Type.Literal(1),
  ok: Type.Literal(false), requestId: Type.Union([UUIDSchema, Type.Null()]), error: FaultSchema,
});
export type Fault = Static<typeof FaultSchema>;
export class RpcError extends Error {
  readonly status: number;
  constructor(readonly fault: Fault) { super(fault.message); this.name = "RpcError"; this.status = ERROR_STATUS[fault.code]; }
}
export function fail(code: ErrorCode, message: string, details?: Fault["details"], retryable = false): never {
  throw new RpcError({ code, message, retryable, ...(details ? { details } : {}) });
}

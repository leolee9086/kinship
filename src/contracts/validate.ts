/** 两端共享的严格 JSON Schema 校验器；不改输入对象、不插值、不删除未知字段。 */
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Static, TSchema } from "@sinclair/typebox";
import { JsonSchema } from "./primitives";
import { fail, type ErrorCode } from "./errors";

const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(ajv); ajv.addSchema(JsonSchema);
const cache = new WeakMap<TSchema, ValidateFunction>();
export function parse<T extends TSchema>(schema: T, value: unknown, code: ErrorCode = "INVALID_REQUEST"): Static<T> {
  let validate = cache.get(schema);
  if (!validate) { validate = ajv.compile(schema); cache.set(schema, validate); }
  if (!validate(value)) fail(code, code === "INVALID_REQUEST" ? "请求不符合接口契约" : "响应不符合接口契约", {
    issues: (validate.errors ?? []).slice(0, 32).map(issue => ({ path: issue.instancePath, keyword: issue.keyword,
      message: issue.message ?? "校验失败", params: issue.params })),
  });
  return value as Static<T>;
}

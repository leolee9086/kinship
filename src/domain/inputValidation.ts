/** 领域请求与文件协议共用的无副作用校验原语。 */
import { isUUID } from "./concepts";
export class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "InputError"; }
}
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new InputError(message);
}
export function object(value: unknown): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "需要对象数据");
}
export function uuid(value: unknown): asserts value is string { assert(isUUID(value), "概念及槽位 ID 必须是 UUID"); }
export function text(value: unknown, name: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${name}不能为空`);
}

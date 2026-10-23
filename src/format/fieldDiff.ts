/** 只比较可序列化字段；缺席的可选字段由显式 unset 命令表达。 */
import { canonicalJSON } from "./json";
export function sameField(left: unknown, right: unknown): boolean {
  return left === undefined || right === undefined ? left === right : canonicalJSON(left) === canonicalJSON(right);
}
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (after[key] !== undefined && !sameField(before[key], after[key])) result[key] = after[key];
  }
  return result;
}

/** 稳定 JSON：UTF-8 文件内容统一为 LF，键排序但数组顺序不变；拒绝损坏与可执行值。 */
import type { JsonValue } from "../domain/concepts";
import { InputError } from "../domain/inputValidation";

export function canonicalJSON(value: unknown): string {
  const active = new Set<object>();
  const normalize = (item: unknown, depth: number): JsonValue => {
    if (depth > 64) throw new InputError("JSON 嵌套超过 64 层");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || item === null) throw new InputError("文件包含非 JSON 值");
    if (active.has(item)) throw new InputError("文件包含循环引用");
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
      throw new InputError("文件仅接受普通 JSON 对象");
    active.add(item);
    const result: JsonValue = Array.isArray(item) ? item.map(child => normalize(child, depth + 1))
      : Object.fromEntries(Object.keys(item).sort().filter(key => (item as Record<string, unknown>)[key] !== undefined)
        .map(key => [key, normalize((item as Record<string, unknown>)[key], depth + 1)]));
    active.delete(item);
    return result;
  };
  return JSON.stringify(normalize(value, 0), null, 2) + "\n";
}

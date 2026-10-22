/** 可导出给其他后端的 JSON Schema 原语；协议不做类型强转或静默补默认值。 */
import { Type, type TObject, type TProperties, type ObjectOptions } from "@sinclair/typebox";

export const UUIDSchema = Type.String({ pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" });
export const VersionSchema = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const LabelSchema = Type.String({ minLength: 1, maxLength: 512, pattern: "\\S" });
export const JsonSchema = Type.Recursive(Self => Type.Union([
  Type.Null(), Type.Boolean(), Type.Number(), Type.String(), Type.Array(Self), Type.Record(Type.String(), Self),
]), { $id: "kinship.json" });
// 递归定义只注册一次；复用时引用它，避免成功/错误联合包络重复声明同一个 $id。
export const AttributesSchema = Type.Record(Type.String({ maxLength: 256 }), Type.Ref(JsonSchema));
export function strictObject<T extends TProperties>(properties: T, options: ObjectOptions = {}): TObject<T> {
  return Type.Object(properties, { ...options, additionalProperties: false });
}
export const RegionSchema = Type.Union([Type.Literal("up"), Type.Literal("down"), Type.Literal("left"), Type.Literal("right")]);
export const ModeSchema = Type.Union([Type.Literal("main"), Type.Literal("dim"), Type.Literal("related"), Type.Literal("hidden")]);

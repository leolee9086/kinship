/** 文件写入使用区段版本或完整 CRDT 增量；文章结构变更另有整正文 CAS。 */
import { Type } from "@sinclair/typebox";
import { strictObject, UUIDSchema } from "./primitives";
const target = { id: UUIDSchema, fileId: UUIDSchema };
export const documentOperations = [
  strictObject({ type: Type.Literal("document.replaceFile"), ...target,
    expectedVersion: Type.Integer({ minimum: 1 }), text: Type.String({ maxLength: 1048576 }) }),
  strictObject({ type: Type.Literal("document.updateCrdt"), ...target,
    update: Type.String({ minLength: 4, maxLength: 4194304, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$" }) }),
] as const;

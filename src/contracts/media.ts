/** 二进制不进 JSON；JSON 元数据与上传字节的大小、类型、摘要必须相符。 */
import { Type } from "@sinclair/typebox";
import { LabelSchema, strictObject, UUIDSchema, VersionSchema } from "./primitives";
export const DigestSchema = Type.String({ pattern: "^[0-9a-f]{64}$" });
export const MediaTypeSchema = Type.Union(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif", "video/mp4", "video/webm", "video/ogg"].map(value => Type.Literal(value)));
export const UploadSchema = strictObject({ id: UUIDSchema, name: LabelSchema, type: MediaTypeSchema,
  size: Type.Integer({ minimum: 1, maximum: 100 * 1024 * 1024 }), sha256: DigestSchema,
});
export const MediaInfoSchema = strictObject({ ...UploadSchema.properties, version: VersionSchema,
  createdAt: Type.String({ format: "date-time" }),
});
export const MediaIdentitySchema = strictObject({ id: UUIDSchema });
export const RemoveMediaSchema = strictObject({ id: UUIDSchema, expectedVersion: VersionSchema });

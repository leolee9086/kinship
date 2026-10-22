/** JSON 配置文件协议：明确格式与版本，运行时、模板和导入使用同一校验。 */
import type { GraphView, PerspectiveSettings, UUID, JsonValue } from "../domain/concepts";
import { assert, object, uuid } from "../domain/inputValidation";
import { validatePresentation } from "../domain/presentationValidation";
import { canonicalJSON } from "./json";

export interface PresentationFile {
  format: "kinship.presentation";
  spec: 1;
  id: UUID;
  viewId: string;
  views: GraphView[];
  perspective: PerspectiveSettings;
  extensions?: Record<string, JsonValue>;
}
export function readPresentation(source: unknown): PresentationFile {
  const value: unknown = typeof source === "string" ? JSON.parse(source) : source;
  object(value);
  assert(value.format === "kinship.presentation", "需要 Kinship 展示配置文件");
  assert(value.spec === 1, "不支持的展示配置版本");
  uuid(value.id); validatePresentation(value);
  // 先检验全部字段可安全保存，再复制；未知扩展不执行，也不会被覆盖掉。
  canonicalJSON(value);
  return structuredClone(value) as unknown as PresentationFile;
}
export function writePresentation(file: PresentationFile): string {
  return canonicalJSON(readPresentation(file));
}

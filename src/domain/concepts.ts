/** 通用概念内核。所有业务概念都使用 UUID，不存在家谱专用存储或兼容身份。 */
import type { Static } from "@sinclair/typebox";
import type { ConceptSchema, ParticipationSchema, RoleConstraintSchema } from "../contracts/concept";
import type { MediaInfoSchema } from "../contracts/media";
export type UUID = string;
export type ConceptId = UUID;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Region = "up" | "down" | "left" | "right";
export type ColorAxis = "relation" | "first-role" | "second-role" | "role-pair";
export const isUUID = (value: unknown): value is UUID => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const newId = (): UUID => crypto.randomUUID();

/** 相同角色可以有多个独立槽；静态类型直接来自运行时契约。 */
export type Participation = Static<typeof ParticipationSchema>;
export type RoleConstraint = Static<typeof RoleConstraintSchema>;
/** 关系与参与者使用同一种概念身份，引用完整性由领域层校验。 */
export type Concept = Static<typeof ConceptSchema>;

export interface RegionRule {
  id: string;
  relationType: ConceptId;
  focusRole?: ConceptId;
  otherRole?: ConceptId;
  region: Region;
  priority: number;
}
export type DisplayMode = "main" | "dim" | "related" | "hidden";
export interface PerspectivePreset {
  id: UUID;
  label: string;
  description: string;
  relations: Record<ConceptId, DisplayMode>;
  concepts: Record<ConceptId, DisplayMode>;
}
export interface PerspectiveSettings {
  presetId: UUID;
  /** 预设定义随工作区持久化；内置分类只是新工作区的可编辑起点。 */
  presets: PerspectivePreset[];
  /** 每个预设独立记忆分类覆盖；不改变演示预设本身。 */
  overrides: Record<UUID, { relations: Record<ConceptId, DisplayMode>; concepts: Record<ConceptId, DisplayMode> }>;
}
export interface GraphView {
  id: string;
  label: string;
  description: string;
  primaryTypes: ConceptId[];
  rules: RegionRule[];
  regionLabels: Record<Region, string>;
}
/** 视角决定看什么；展示配置决定怎样画。两者不共享预设身份。 */
export interface GraphStyle {
  regionGaps: Record<Region, number>;
  regionOverrides: Record<string, Region>;
  colorAxis: ColorAxis;
  colorDepth: number;
  palette: Record<string, string>;
  dimOpacity: number;
  showRelationLabels: boolean;
  curve: { type: "bezier" | "straight"; curvature: number };
  background: BackgroundSettings;
}
export interface BackgroundSettings {
  mediaId: UUID | null;
  opacity: number;
  blur: number;
  paused: boolean;
}
export interface GraphSettings extends GraphStyle {
  /** 视图只选方向/排布样式；不参与显示过滤。 */
  viewId: string;
  views: GraphView[];
  perspective: PerspectiveSettings;
  focusId: UUID | null;
  depth: number;
  expandedRelations: UUID[];
}
export interface ConceptSnapshot {
  version: 1;
  concepts: Concept[];
  settings: GraphSettings;
  revision: number;
  /** 资源版本用于乐观并发，空间 revision 只提供提交顺序。 */
  conceptVersions: Record<UUID, number>;
  presentationVersion: number;
  viewStateVersion: number;
}
export interface ConceptMutation { put?: Concept[]; remove?: ConceptId[] }
export type MediaInfo = Static<typeof MediaInfoSchema>;
export interface StoredMedia extends MediaInfo { blob: Blob }

/** 固定 UUID 只标识五个通用语义根；领域词汇与默认视角属于 JSON 模板。 */
export const C = {
  type: "7bb62b43-e0fd-4e21-ac33-2ff51a6050f5",
  role: "33d12d5b-8b96-4b4d-b8e8-8cb5cb93f6a5",
  concept: "e8881fbf-6877-4a76-814e-dbcd45d63d03",
  relation: "eed3a8a2-80e5-4ccc-bd08-ecf843909618",
  participant: "6ec6cd7a-4cde-4461-9bb2-9caef9a835bd",
} as const;

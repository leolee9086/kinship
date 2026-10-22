/** 通用概念内核。所有业务概念都使用 UUID，不存在家谱专用存储或兼容身份。 */
export type UUID = string;
export type ConceptId = UUID;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Region = "up" | "down" | "left" | "right";
export type ColorAxis = "relation" | "parent-role" | "child-role" | "role-pair";
export const isUUID = (value: unknown): value is UUID => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const newId = (): UUID => crypto.randomUUID();

export interface Participation {
  /** 相同角色可以出现多次，不能以 role 为字典键丢掉多位参与者。 */
  id: UUID;
  role: ConceptId;
  concept: ConceptId;
}
export interface RoleConstraint { role: ConceptId; min?: number; max?: number }
export interface Concept {
  id: ConceptId;
  label: string;
  aliases?: string[];
  description?: string;
  types: ConceptId[];
  broader?: ConceptId[];
  /** 关系概念的结构能力；关系本身与参与者使用同一种概念身份。 */
  participants?: Participation[];
  schema?: { roles?: RoleConstraint[]; symmetric?: boolean; color?: string };
  properties?: Record<string, JsonValue>;
}

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
}
export interface ConceptMutation { put?: Concept[]; remove?: ConceptId[] }
export interface MediaInfo { id: UUID; name: string; type: string; size: number; createdAt: string }
export interface StoredMedia extends MediaInfo { blob: Blob }

export const P = {
  genealogy: "1a23969d-9c46-40ae-8997-f9df737d6394",
  work: "77cc46e2-72d1-4bc0-9a6a-da1458ae2584",
  events: "b207cf0b-b798-43b1-9d14-0f53b90e819f",
  all: "6fcdd38c-d4f9-425f-93e3-1c649937ade6",
} as const;
export const DEFAULT_SETTINGS: GraphSettings = {
  viewId: "genealogy", focusId: null, depth: 2,
  perspective: { presetId: P.genealogy, overrides: {} },
  regionGaps: { up: 100, down: 100, left: 100, right: 100 },
  colorAxis: "relation", colorDepth: 2, palette: {}, dimOpacity: 0.055,
  curve: { type: "bezier", curvature: 0.52 },
  showRelationLabels: true, expandedRelations: [], regionOverrides: {},
  background: { mediaId: null, opacity: 0.28, blur: 0, paused: false },
};
export const freshSettings = (): GraphSettings => structuredClone(DEFAULT_SETTINGS);

/** 固定 UUID 仅作内置词汇身份。代码中的短名称是引用常量，不进入数据库作为 ID。 */
export const C = {
  type: "7bb62b43-e0fd-4e21-ac33-2ff51a6050f5",
  role: "33d12d5b-8b96-4b4d-b8e8-8cb5cb93f6a5",
  concept: "e8881fbf-6877-4a76-814e-dbcd45d63d03",
  person: "98526bf9-8917-4799-83c7-137b8372a45e",
  place: "07ae6524-792b-4a25-ad9a-3f614fb4cc82",
  event: "b41ce38d-bac6-4a3b-9025-fbec2855d313",
  organization: "1a1e09f6-6eb5-45d9-8b45-c24aef5d3ecd",
  document: "b25c2674-79f5-42b0-9114-8beac6725c8d",
  family: "e5f7221c-8977-4331-8f01-ee1342be2522",
  relation: "eed3a8a2-80e5-4ccc-bd08-ecf843909618",
  kinship: "fbbac363-58eb-4a4e-a698-63b1e87bf573",
  social: "8dc4f6d4-4fc1-4d3d-8ed2-73a85bd90440",
  context: "7960abe9-8795-43db-aaaf-8c8c9081ef7a",
  parenthood: "b90fa60e-02d3-4edd-803d-caa7d6a7ad8b",
  spouse: "b3e2ffe9-9e08-401e-b270-c63a70918633",
  sibling: "8785ae0b-b474-45d4-928b-0aef4451c08f",
  colleague: "65e2cd10-e6a5-4231-9e39-b2de34813ae8",
  participation: "d335dd59-0197-438b-bd37-f3758576ff49",
  location: "3ef2a890-838b-490c-bcf3-2d79e69b6644",
  evidence: "884017f1-f17a-4e25-90b6-f5dabd5b4c15",
  membership: "35b76f71-973c-4542-8269-5d40d3babbe5",
  association: "1a30859c-5f2d-430a-ad3b-5e9be5235d13",
  participant: "6ec6cd7a-4cde-4461-9bb2-9caef9a835bd",
  parent: "819024b7-b7b0-4099-9827-b8681318eb17",
  father: "9491bc03-fa05-4cbe-a558-9a251b911a43",
  mother: "311efa04-616b-4d99-a446-5d76b70e46f6",
  child: "0fa90cf1-6218-4d39-8147-561b58430654",
  son: "47943415-e648-448d-b058-4193622aacb4",
  daughter: "10cb216a-cf9f-4408-8493-c1ef45980e50",
  spouseRole: "e2e7c81f-b9e8-445c-ba97-7d60b6240645",
  siblingRole: "3582733e-a1bf-4904-8702-81017810059c",
  colleagueRole: "4ff91037-6dc2-4079-949e-af8edb475cee",
  subject: "e9f39dea-f025-432f-a7ab-f1fe83a7177b",
  object: "e0efad05-2672-4b2b-b40b-76c72d40f89a",
  eventRole: "e4364452-3ddb-41a9-9997-9471e695bd61",
  placeRole: "a8e1e592-fb34-4632-9a6d-76be07a238f0",
  source: "5dc763d1-f323-4762-a21c-2ac4105826f1",
  claim: "93224d47-b77f-4d6a-9b4d-aaec4fd28e0a",
  member: "96e4deb5-8bed-4e48-98c9-8a8d0529b152",
  group: "1fd33de0-63ca-4e31-87ae-da9ccec959a0",
} as const;

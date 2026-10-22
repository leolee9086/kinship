/** 动态视角和方向配置的格式校验。这里只识别语义能力，不列举任何领域分类。 */
import { C, type GraphSettings } from "./concepts";
import type { ConceptIndex } from "./conceptIndex";
import { assert, object, text, uuid } from "./inputValidation";

const directions = new Set(["up", "down", "left", "right"]);
const modes = new Set(["main", "dim", "related", "hidden"]);
function rules(value: unknown): void {
  object(value);
  for (const [id, mode] of Object.entries(value)) { uuid(id); assert(modes.has(String(mode)), "视角显示方式无效"); }
}

export function validatePresentation(value: unknown): Pick<GraphSettings, "views" | "viewId" | "perspective"> {
  object(value);
  assert(Array.isArray(value.views) && value.views.length > 0, "至少保留一个方向布局");
  const views = new Set<string>();
  for (const view of value.views) {
    object(view); text(view.id, "布局身份"); text(view.label, "布局名称");
    assert(!views.has(view.id), "方向布局身份重复"); views.add(view.id);
    assert(typeof view.description === "string", "布局说明必须为字符串");
    assert(Array.isArray(view.primaryTypes), "布局主类型必须为数组"); view.primaryTypes.forEach(uuid);
    object(view.regionLabels);
    for (const side of directions) text(view.regionLabels[side], "方向标签");
    assert(Array.isArray(view.rules) && view.rules.length > 0, "布局至少需要一个方向规则");
    const ids = new Set<string>();
    for (const rule of view.rules) {
      object(rule); text(rule.id, "规则身份"); uuid(rule.relationType);
      assert(!ids.has(rule.id), "同一布局的规则身份重复"); ids.add(rule.id);
      if (rule.focusRole !== undefined) uuid(rule.focusRole);
      if (rule.otherRole !== undefined) uuid(rule.otherRole);
      assert(directions.has(String(rule.region)), "规则方向无效");
      assert(typeof rule.priority === "number" && Number.isFinite(rule.priority), "规则优先级必须为有限数值");
    }
  }
  assert(typeof value.viewId === "string" && views.has(value.viewId), "未知的视图配置");
  object(value.perspective);
  const p = value.perspective;
  assert(Array.isArray(p.presets) && p.presets.length > 0, "至少保留一个视角");
  const presets = new Set<string>();
  for (const preset of p.presets) {
    object(preset); uuid(preset.id); text(preset.label, "视角名称");
    assert(!presets.has(preset.id), "视角 UUID 重复"); presets.add(preset.id);
    assert(typeof preset.description === "string", "视角说明必须为字符串");
    rules(preset.concepts); rules(preset.relations);
    assert((preset.concepts as Record<string, unknown>)[C.concept] !== undefined
      && (preset.relations as Record<string, unknown>)[C.relation] !== undefined, "视角必须覆盖通用概念和关系根分类");
  }
  assert(typeof p.presetId === "string" && presets.has(p.presetId), "未知视角预设");
  object(p.overrides);
  for (const [id, override] of Object.entries(p.overrides)) {
    assert(presets.has(id), "视角覆盖引用无效"); object(override); rules(override.concepts); rules(override.relations);
  }
  return value as unknown as Pick<GraphSettings, "views" | "viewId" | "perspective">;
}

/** 存储与文件导入共用引用检查，防止删掉预设仍在使用的自定义类型/角色。 */
export function validatePresentationReferences(settings: GraphSettings, index: ConceptIndex): void {
  const requireType = (id: string) => assert(index.byId.has(id) && index.isType(index.get(id)), "配置分类必须引用类型概念");
  const requireRole = (id: string) => assert(index.byId.has(id) && index.isRole(index.get(id)), "方向角色必须引用参与角色");
  for (const preset of settings.perspective.presets) {
    for (const id of [...Object.keys(preset.concepts), ...Object.keys(preset.relations)]) requireType(id);
  }
  for (const override of Object.values(settings.perspective.overrides)) {
    for (const id of [...Object.keys(override.concepts), ...Object.keys(override.relations)]) requireType(id);
  }
  for (const view of settings.views) {
    view.primaryTypes.forEach(requireType);
    for (const rule of view.rules) {
      requireType(rule.relationType);
      assert(index.descends(rule.relationType, C.relation), "方向规则必须引用关系类型");
      if (rule.focusRole) requireRole(rule.focusRole);
      if (rule.otherRole) requireRole(rule.otherRole);
    }
  }
}

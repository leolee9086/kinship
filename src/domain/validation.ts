/** 服务边界校验。错误显式返回，不能通过忽略非法字段制造“保存成功”。 */
import { isUUID, type Concept, type ConceptMutation, type GraphSettings } from "./concepts";
import { ConceptIndex } from "./conceptIndex";
import { assert, object, text, uuid } from "./inputValidation";
import { validatePresentation } from "./presentationValidation";
import { coreVocabulary } from "./coreVocabulary";

/** 外部集合仅供显式边界文件校验参与对象；数据库提交始终使用空集合。 */
export function validateConcepts(values: unknown, externalParticipants: ReadonlySet<string> = new Set()): Concept[] {
  assert(Array.isArray(values), "概念集合必须是数组");
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const value of values) {
    object(value); uuid(value.id); text(value.label, "概念名称");
    assert(value.forgotten === undefined || value.forgotten === true, "遗忘标记只能为true或不存在");
    assert(!coreVocabulary.has(value.id) || value.forgotten === undefined, "不能遗忘通用语义根");
    assert(!ids.has(value.id), "概念 UUID 重复"); ids.add(value.id);
    assert(Array.isArray(value.types) && value.types.length > 0, "概念至少需要一个类型");
    value.types.forEach(uuid);
    if (value.broader !== undefined) { assert(Array.isArray(value.broader), "上级分类必须是数组"); value.broader.forEach(uuid); }
    if (value.aliases !== undefined) assert(Array.isArray(value.aliases) && value.aliases.every(a => typeof a === "string"), "别名必须是字符串数组");
    if (value.description !== undefined) assert(typeof value.description === "string", "说明必须是字符串");
    if (value.properties !== undefined) {
      object(value.properties);
      // JSON 请求不接受 NaN、循环对象或函数；本地内部调用同样遵守这一契约。
      const check = (v: unknown): void => {
        assert(v === null || ["string", "boolean", "number", "object"].includes(typeof v), "属性必须是 JSON 值");
        if (typeof v === "number") assert(Number.isFinite(v), "属性数字必须有限");
        if (v && typeof v === "object") for (const item of Object.values(v)) check(item);
      };
      check(value.properties);
    }
    if (value.participants !== undefined) {
      assert(Array.isArray(value.participants) && value.participants.length >= 2, "关系至少需要两个参与槽");
      for (const p of value.participants) {
        object(p); uuid(p.id); uuid(p.role); uuid(p.concept);
        assert(!slots.has(p.id), "参与槽 UUID 重复"); slots.add(p.id);
      }
    }
    if (value.schema !== undefined) {
      object(value.schema);
      if (value.schema.color !== undefined) assert(typeof value.schema.color === "string" && /^#[0-9a-f]{6}$/i.test(value.schema.color), "类型颜色必须为六位十六进制色值");
      if (value.schema.symmetric !== undefined) assert(typeof value.schema.symmetric === "boolean", "对称标记必须为布尔值");
      if (value.schema.roles !== undefined) {
        assert(Array.isArray(value.schema.roles), "角色约束必须是数组");
        for (const r of value.schema.roles) {
          object(r); uuid(r.role);
          if (r.min !== undefined) assert(Number.isInteger(r.min) && Number(r.min) >= 0, "角色最小数量必须为非负整数");
          if (r.max !== undefined) assert(Number.isInteger(r.max) && Number(r.max) >= Number(r.min ?? 0), "角色最大数量无效");
        }
      }
    }
  }
  for (const slot of slots) assert(!ids.has(slot) && !externalParticipants.has(slot), "参与槽不能复用概念 UUID");
  const concepts = values as Concept[];
  const index = new ConceptIndex(concepts);
  for (const c of concepts) {
    for (const t of c.types) assert(index.byId.has(t) && index.isType(index.get(t)), `类型引用无效：${t}`);
    for (const parent of c.broader ?? []) assert(index.byId.has(parent), `上级概念不存在：${parent}`);
    for (const p of c.participants ?? []) {
      assert(index.byId.has(p.concept) || externalParticipants.has(p.concept), `参与概念不存在：${p.concept}`);
      assert(index.byId.has(p.role) && index.isRole(index.get(p.role)), `角色引用无效：${p.role}`);
    }
    for (const constraint of c.schema?.roles ?? []) assert(index.byId.has(constraint.role) && index.isRole(index.get(constraint.role)), "结构声明引用了非法角色");
  }
  // 只禁止分类继承环。现实关系允许环、对称关系和同一对概念的多条关系。
  const done = new Set<string>();
  const active = new Set<string>();
  const walk = (id: string): void => {
    if (done.has(id)) return;
    assert(!active.has(id), "分类层级不能成环"); active.add(id);
    for (const parent of index.get(id).broader ?? []) walk(parent);
    active.delete(id); done.add(id);
  };
  for (const c of concepts) walk(c.id);
  for (const c of concepts) for (const typeId of c.types) {
    for (const ancestor of index.ancestors(typeId)) for (const r of index.get(ancestor).schema?.roles ?? []) {
      const count = (c.participants ?? []).filter(p => index.descends(p.role, r.role)).length;
      // 结构声明约束实例，不约束类型概念本身。
      if (index.isType(c)) continue;
      assert(count >= (r.min ?? 0) && count <= (r.max ?? Infinity), `${c.label} 的“${index.roleLabel(r.role)}”参与数量不满足类型约束`);
    }
  }
  return concepts;
}

export function applyMutation(current: readonly Concept[], input: unknown): Concept[] {
  object(input);
  assert(input.put === undefined || Array.isArray(input.put), "put 必须是数组");
  assert(input.remove === undefined || Array.isArray(input.remove), "remove 必须是数组");
  const mutation = input as ConceptMutation;
  const result = new Map(current.map(c => [c.id, c]));
  for (const id of mutation.remove ?? []) {
    uuid(id); assert(!coreVocabulary.has(id), "不能删除通用语义根");
    assert(result.has(id), "待删除概念不存在"); result.delete(id);
  }
  for (const c of mutation.put ?? []) { object(c); uuid(c.id); result.set(c.id, c); }
  // 被其他类型、角色或关系引用时拒绝删除；不存在静默级联删除。
  return validateConcepts([...result.values()]);
}

export function validateSettings(value: unknown): GraphSettings {
  object(value);
  validatePresentation(value);
  assert(value.focusId === null || isUUID(value.focusId), "焦点必须为 UUID 或 null");
  assert(Number.isInteger(value.depth) && Number(value.depth) >= 1 && Number(value.depth) <= 12, "邻域深度必须为 1–12");
  object(value.regionGaps);
  for (const side of ["up", "down", "left", "right"]) {
    const gap = value.regionGaps[side];
    assert(typeof gap === "number" && Number.isFinite(gap) && gap >= 16 && gap <= 1000, `${side}方向间距超出范围`);
  }
  assert(typeof value.dimOpacity === "number" && Number.isFinite(value.dimOpacity) && value.dimOpacity >= 0 && value.dimOpacity <= 1, "淡显强度超出范围");
  object(value.curve);
  assert(["bezier", "straight"].includes(String(value.curve.type)) && Number.isFinite(value.curve.curvature) && Number(value.curve.curvature) >= 0 && Number(value.curve.curvature) <= 3, "关系线样式无效");
  assert(["relation", "first-role", "second-role", "role-pair"].includes(String(value.colorAxis)), "未知赋色轴");
  assert(Number.isInteger(value.colorDepth) && Number(value.colorDepth) >= 0 && Number(value.colorDepth) <= 12, "颜色区分深度必须为 0–12");
  assert(typeof value.showRelationLabels === "boolean", "关系文字设置必须为布尔值");
  assert(Array.isArray(value.expandedRelations), "展开关系必须是数组"); value.expandedRelations.forEach(uuid);
  object(value.palette);
  for (const color of Object.values(value.palette)) assert(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color), "调色映射必须使用六位色值");
  object(value.regionOverrides);
  for (const region of Object.values(value.regionOverrides)) assert(["up", "down", "left", "right"].includes(String(region)), "方向配置无效");
  object(value.background);
  assert(value.background.mediaId === null || isUUID(value.background.mediaId), "媒体 ID 必须为 UUID");
  assert(typeof value.background.opacity === "number" && value.background.opacity >= 0 && value.background.opacity <= 1, "背景强度必须为 0–1");
  assert(typeof value.background.blur === "number" && value.background.blur >= 0 && value.background.blur <= 24, "背景模糊必须为 0–24");
  assert(typeof value.background.paused === "boolean", "背景暂停设置无效");
  return value as unknown as GraphSettings;
}

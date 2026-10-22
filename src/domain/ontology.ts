/** 默认词汇也是普通概念；领域默认值与通用内核分离。 */
import { C, newId, freshSettings, type Concept, type ConceptSnapshot, type GraphView, type RegionRule } from "./concepts";

const type = (id: string, label: string, parent = C.concept as string, color?: string): Concept => ({
  id, label, types: [C.type], broader: id === C.concept ? [] : [parent], schema: { color },
});
const role = (id: string, label: string, parent = C.participant as string): Concept => ({
  id, label, types: [C.role], broader: id === C.participant ? [] : [parent],
});

export function builtinConcepts(): Concept[] {
  return [
    type(C.concept, "概念"), type(C.type, "类型"), type(C.role, "参与角色"),
    type(C.person, "人物", C.concept, "#527fbd"), type(C.place, "地点", C.concept, "#43968a"),
    type(C.event, "事件", C.concept, "#b58a37"), type(C.organization, "组织", C.concept, "#8571b2"),
    type(C.document, "文献", C.concept, "#9b7c68"), type(C.family, "家庭", C.concept, "#b17c95"),
    type(C.relation, "关系", C.concept, "#6e8ca6"),
    type(C.kinship, "亲属关系", C.relation, "#527fbd"),
    type(C.social, "社会关系", C.relation, "#a77c35"),
    type(C.context, "上下文关联", C.relation, "#588f8b"),
    { ...type(C.parenthood, "亲子", C.kinship, "#479c79"), schema: { color: "#479c79",
      roles: [{ role: C.parent, min: 1 }, { role: C.child, min: 1 }] } },
    { ...type(C.spouse, "配偶", C.kinship), schema: { color: "#a16fb0", symmetric: true, roles: [{ role: C.spouseRole, min: 2 }] } },
    { ...type(C.sibling, "兄弟姐妹", C.kinship), schema: { color: "#be9844", symmetric: true, roles: [{ role: C.siblingRole, min: 2 }] } },
    { ...type(C.colleague, "同僚", C.social), schema: { color: "#bd843d", symmetric: true, roles: [{ role: C.colleagueRole, min: 2 }] } },
    type(C.participation, "参与事件", C.context, "#a18a42"),
    type(C.location, "发生于", C.context, "#43968a"),
    type(C.evidence, "文献支持", C.context, "#9c7d64"),
    type(C.membership, "组织成员", C.social, "#8571b2"),
    type(C.association, "关联", C.context, "#6e8ca6"),
    role(C.participant, "参与者"), role(C.parent, "亲职端"), role(C.father, "父", C.parent),
    role(C.mother, "母", C.parent), role(C.child, "子代端"),
    role(C.son, "子", C.child), role(C.daughter, "女", C.child),
    role(C.spouseRole, "配偶"), role(C.siblingRole, "手足"), role(C.colleagueRole, "同僚"),
    role(C.subject, "主体"), role(C.object, "关联对象"), role(C.eventRole, "事件"),
    role(C.placeRole, "地点"), role(C.source, "来源"), role(C.claim, "断言"),
    role(C.member, "成员"), role(C.group, "组织"),
  ];
}

const rule = (id: string, relationType: string, region: RegionRule["region"], priority: number,
  focusRole?: string): RegionRule => ({ id, relationType, region, priority, focusRole });
const familyRules = [
  rule("parents", C.parenthood, "up", 100, C.child),
  rule("children", C.parenthood, "down", 100, C.parent),
  rule("spouses", C.spouse, "left", 90), rule("siblings", C.sibling, "right", 80),
  rule("colleagues", C.colleague, "right", 50),
  rule("events", C.participation, "right", 30), rule("places", C.location, "left", 25),
  rule("evidence", C.evidence, "left", 20), rule("members", C.membership, "right", 35),
  rule("other", C.relation, "right", 1),
];

export const GRAPH_VIEWS: GraphView[] = [
  { id: "genealogy", label: "人物 · 家谱", description: "人物为主轴，亲子关系优先定位；事件与地点仍可聚焦。",
    primaryTypes: [C.person], rules: familyRules,
    regionLabels: { up: "父母 / 上游", down: "子女 / 下游", left: "配偶 / 上下文", right: "手足 / 同僚 / 事件" } },
  { id: "work", label: "人物 · 协作", description: "同僚关系优先定位，亲子作为跨区关系保留。",
    primaryTypes: [C.person, C.organization],
    rules: [rule("work-colleagues", C.colleague, "right", 130), rule("work-groups", C.membership, "left", 120), ...familyRules],
    regionLabels: { up: "上游关联", down: "下游关联", left: "组织 / 上下文", right: "同僚 / 协作" } },
  { id: "events", label: "事件 · 地点", description: "从事件或地点阅读参与者、机构及材料，人物不再垄断布局。",
    primaryTypes: [C.event, C.place],
    rules: [rule("event-people", C.participation, "down", 140), rule("event-place", C.location, "up", 130),
      rule("event-evidence", C.evidence, "left", 120), ...familyRules],
    regionLabels: { up: "地点 / 上游", down: "参与者", left: "文献 / 来源", right: "关联 / 组织" } },
  { id: "concepts", label: "通用 · 概念", description: "所有概念和关系实例可导航，按关系规则组织四方。",
    primaryTypes: [C.concept], rules: familyRules,
    regionLabels: { up: "上游", down: "下游", left: "上下文", right: "关联" } },
];

/** 只在一个全新的概念仓库中创建演示；重开页面不重新生成这些 UUID。 */
export function initialSnapshot(): ConceptSnapshot {
  const concepts = builtinConcepts();
  const node = (label: string, typeId: string, description?: string, properties?: Concept["properties"]) => {
    const id = newId();
    concepts.push({ id, label, types: [typeId], description, properties });
    return id;
  };
  const relationship = (label: string, typeId: string, entries: [string, string][], properties?: Concept["properties"]) => {
    const id = newId();
    concepts.push({ id, label, types: [typeId], properties,
      participants: entries.map(([roleId, concept]) => ({ id: newId(), role: roleId, concept })) });
    return id;
  };
  const lin = node("林承远", C.person, "虚构演示人物。林见川的父亲，也是他的同僚。");
  const son = node("林见川", C.person, "虚构演示人物。可同时阅读他的亲子、协作和事件关系。");
  const mother = node("沈知微", C.person);
  const daughter = node("林照月", C.person);
  const friend = node("顾闻溪", C.person);
  const town = node("青浦镇", C.place, "演示地点，不对应真实历史记载。");
  const archive = node("青浦地方史研究所", C.organization);
  const event = node("地方史料整理会议", C.event, "虚构历史事件，用于演示多人参与。", { subtitle: "1932 · 虚构演示" });
  const flood = node("青浦水患口述整理", C.event, undefined, { subtitle: "1933 · 虚构演示" });
  const document = node("地方史料工作纪要", C.document, "虚构文献，支持具体关系实例，而不只关联人物。");
  const fatherSon = relationship("林承远与林见川的父子关系", C.parenthood, [[C.father, lin], [C.son, son]]);
  relationship("沈知微与林见川的母子关系", C.parenthood, [[C.mother, mother], [C.son, son]]);
  relationship("林承远与林照月的父女关系", C.parenthood, [[C.father, lin], [C.daughter, daughter]]);
  relationship("沈知微与林照月的母女关系", C.parenthood, [[C.mother, mother], [C.daughter, daughter]]);
  relationship("林承远与沈知微的配偶关系", C.spouse, [[C.spouseRole, lin], [C.spouseRole, mother]]);
  relationship("林见川与林照月的手足关系", C.sibling, [[C.siblingRole, son], [C.siblingRole, daughter]]);
  const colleagues = relationship("父子同时也是同僚", C.colleague, [[C.colleagueRole, lin], [C.colleagueRole, son]], { period: "1930–1935（虚构）" });
  relationship("三人共同整理史料", C.colleague, [[C.colleagueRole, lin], [C.colleagueRole, son], [C.colleagueRole, friend]]);
  relationship("会议参与记录", C.participation, [[C.eventRole, event], [C.participant, lin], [C.participant, son], [C.participant, friend]]);
  relationship("会议发生于青浦镇", C.location, [[C.subject, event], [C.placeRole, town]]);
  relationship("研究所位于青浦镇", C.location, [[C.subject, archive], [C.placeRole, town]]);
  relationship("研究所成员记录", C.membership, [[C.group, archive], [C.member, lin], [C.member, son], [C.member, friend]]);
  relationship("水患资料整理参与记录", C.participation, [[C.eventRole, flood], [C.participant, daughter], [C.participant, son]]);
  relationship("纪要记载父子关系", C.evidence, [[C.source, document], [C.claim, fatherSon]]);
  relationship("纪要记载同僚关系", C.evidence, [[C.source, document], [C.claim, colleagues]]);
  const settings = freshSettings();
  settings.focusId = lin;
  return { version: 1, concepts, settings, revision: 0 };
}

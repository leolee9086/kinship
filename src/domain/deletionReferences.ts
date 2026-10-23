/** 只把模式声明的UUID字段当引用；任意JSON属性和历史来源不被猜测成活引用。 */
import type { ConceptRecord, PresentationRecord, ViewStateRecord } from "../contracts/commands";
import type { DeleteReference } from "../contracts/deletion";
import { fail } from "../contracts/errors";
import { coreVocabulary } from "./coreVocabulary";
export interface SavedNavigation extends ViewStateRecord { id: string }
export interface DeletionState { concepts: ConceptRecord[]; presentation: PresentationRecord; navigation: SavedNavigation[]; actorId: string }
export function deletionReferences(id: string, state: DeletionState): DeleteReference[] {
  const refs: DeleteReference[] = [];
  const add = (kind: DeleteReference["kind"], ownerId: string, label: string, path: string) => {
    if (refs.length === 2000) fail("PAYLOAD_TOO_LARGE", "删除引用超过2000项，请先减少引用后重新预览");
    refs.push({ kind, ownerId, label, path });
  };
  if (coreVocabulary.has(id)) add("core", id, "通用语义根", "identity");
  for (const { concept: c } of state.concepts) {
    if (c.id === id) continue; // 目标自身的出向引用随其删除，不是外部依赖。
    for (const field of ["types", "broader"] as const) if (c[field]?.includes(id)) add("concept", c.id, c.label, field);
    for (const slot of c.participants ?? []) for (const field of ["concept", "role"] as const)
      if (slot[field] === id) add("concept", c.id, c.label, `participants.${slot.id}.${field}`);
    for (const [at, role] of (c.schema?.roles ?? []).entries()) if (role.role === id) add("concept", c.id, c.label, `schema.roles.${at}.role`);
  }
  for (const view of state.presentation.data.views) {
    if (view.primaryTypes.includes(id)) add("view", view.id, view.label, "primaryTypes");
    for (const rule of view.rules) for (const field of ["relationType", "focusRole", "otherRole"] as const)
      if (rule[field] === id) add("view", view.id, view.label, `rules.${rule.id}.${field}`);
  }
  for (const preset of state.presentation.data.presets) for (const field of ["concepts", "relations"] as const)
    if (id in preset[field]) add("perspective", preset.id, preset.label, field);
  for (const nav of state.navigation) {
    const own = nav.id === state.actorId, owner = own ? "current-view-state" : "other-view-state", label = own ? "当前人的展示设置" : "其他已保存的导航";
    // 只允许当前人自己的焦点/展开列表由明确删除流程清理，不修改他人状态。
    if (!own && nav.data.focusId === id) add("navigation", owner, label, "focusId");
    if (!own && nav.data.expandedRelations.includes(id)) add("navigation", owner, label, "expandedRelations");
    for (const [preset, override] of Object.entries(nav.data.overrides)) for (const field of ["concepts", "relations"] as const)
      if (id in override[field]) add("navigation", owner, label, `overrides.${preset}.${field}`);
  }
  return refs;
}

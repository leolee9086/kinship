/** 视图/视角按身份更新，个人状态只合并声明字段；最终引用统一由图计划校验。 */
import type { Delta, Operation, PresentationRecord, ViewStateRecord } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { checkVersion } from "./versions";

/** 同一事务的多个字段操作共享原始前置版本，每个资源只递增一次。 */
export function planSettingsBatch(operations: readonly Operation[], presentation: PresentationRecord, viewState: ViewStateRecord): Pick<Delta, "presentation" | "viewState"> {
  const result: Pick<Delta, "presentation" | "viewState"> = {};
  for (const op of operations) {
    const change = planSettings(op, { data: result.presentation?.data ?? presentation.data, version: presentation.version },
      { data: result.viewState?.data ?? viewState.data, version: viewState.version });
    if (change?.presentation) result.presentation = change.presentation;
    if (change?.viewState) result.viewState = change.viewState;
  }
  return result;
}
function planSettings(op: Operation, presentation: PresentationRecord, viewState: ViewStateRecord): {
  presentation?: PresentationRecord; viewState?: ViewStateRecord;
} | null {
  if (op.type === "viewState.updateFields") {
    checkVersion("viewState", op.expectedVersion, viewState.version);
    return { viewState: { version: viewState.version + 1, data: { ...viewState.data, ...op.fields } } };
  }
  if (op.type !== "view.create" && op.type !== "view.updateFields" && op.type !== "view.delete"
    && op.type !== "perspective.create" && op.type !== "perspective.updateFields" && op.type !== "perspective.delete") return null;
  checkVersion("presentation", op.expectedVersion, presentation.version);
  let { views, presets } = presentation.data;
  if (op.type === "view.create") {
    if (views.some(view => view.id === op.view.id)) fail("VERSION_CONFLICT", "视图身份已存在", { id: op.view.id });
    views = [...views, op.view];
  } else if (op.type === "view.updateFields" || op.type === "view.delete") {
    if (!views.some(view => view.id === op.id)) fail("NOT_FOUND", "视图不存在", { id: op.id });
    views = op.type === "view.delete" ? views.filter(view => view.id !== op.id) : views.map(view => view.id === op.id ? { ...view, ...op.fields } : view);
  } else if (op.type === "perspective.create") {
    if (presets.some(preset => preset.id === op.perspective.id)) fail("VERSION_CONFLICT", "视角身份已存在", { id: op.perspective.id });
    presets = [...presets, op.perspective];
  } else {
    if (!presets.some(preset => preset.id === op.id)) fail("NOT_FOUND", "视角不存在", { id: op.id });
    presets = op.type === "perspective.delete" ? presets.filter(preset => preset.id !== op.id) : presets.map(preset => preset.id === op.id ? { ...preset, ...op.fields } : preset);
  }
  return { presentation: { version: presentation.version + 1, data: { views, presets } } };
}

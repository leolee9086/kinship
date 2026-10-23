/** 设置面板仍编辑视图模型，适配器将差异编译成具体定义/个人字段命令。 */
import type { Operation } from "../contracts/commands";
import type { ConceptSnapshot, GraphSettings } from "../domain/concepts";
import { splitSettings } from "../domain/presentationState";
import { changedFields } from "../format/fieldDiff";

export function settingsCommands(current: ConceptSnapshot, settings: GraphSettings): Operation[] {
  const previous = splitSettings(current.settings), next = splitSettings(settings), result: Operation[] = [];
  const expectedVersion = current.presentationVersion;
  const oldViews = new Map(previous.presentation.views.map(view => [view.id, view]));
  for (const view of next.presentation.views) {
    const old = oldViews.get(view.id);
    if (!old) result.push({ type: "view.create", view, expectedVersion });
    else {
      const { id: _, ...fields } = changedFields(old, view);
      if (Object.keys(fields).length) result.push({ type: "view.updateFields", id: view.id, fields, expectedVersion });
      oldViews.delete(view.id);
    }
  }
  for (const id of oldViews.keys()) result.push({ type: "view.delete", id, expectedVersion });
  const oldPresets = new Map(previous.presentation.presets.map(preset => [preset.id, preset]));
  for (const perspective of next.presentation.presets) {
    const old = oldPresets.get(perspective.id);
    if (!old) result.push({ type: "perspective.create", perspective, expectedVersion });
    else {
      const { id: _, ...fields } = changedFields(old, perspective);
      if (Object.keys(fields).length) result.push({ type: "perspective.updateFields", id: perspective.id, fields, expectedVersion });
      oldPresets.delete(perspective.id);
    }
  }
  for (const id of oldPresets.keys()) result.push({ type: "perspective.delete", id, expectedVersion });
  const fields = changedFields(previous.viewState, next.viewState);
  if (Object.keys(fields).length) result.push({ type: "viewState.updateFields", fields, expectedVersion: current.viewStateVersion });
  return result;
}

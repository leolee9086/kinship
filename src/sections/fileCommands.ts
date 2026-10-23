/** 主体文件命令的状态空间分派；适配器不依赖本模块。 */
import { zodCalibur, zodState } from "calibur-router/zod";
const state = zodState.object({
  mode: zodState.enumerated("whole-file", "crdt"),
  intent: zodState.enumerated("replace", "crdt-update"),
  writable: zodState.boolean(), busy: zodState.boolean(), exists: zodState.boolean(),
});
export const dispatchFileCommand = zodCalibur.universe(state)
  .split(zodState.object({ writable: zodState.literal(false) }), () => "forbidden" as const)
  .split(zodState.object({ writable: zodState.literal(true), exists: zodState.literal(false) }), () => "missing" as const)
  .split(zodState.object({ writable: zodState.literal(true), exists: zodState.literal(true), busy: zodState.literal(true) }), () => "busy" as const)
  .split(zodState.object({ writable: zodState.literal(true), exists: zodState.literal(true), busy: zodState.literal(false), mode: zodState.literal("whole-file"), intent: zodState.literal("replace") }), () => "replace" as const)
  .split(zodState.object({ writable: zodState.literal(true), exists: zodState.literal(true), busy: zodState.literal(false), mode: zodState.literal("crdt"), intent: zodState.literal("crdt-update") }), () => "crdt-update" as const)
  .otherwise(() => "mode-mismatch" as const).build();

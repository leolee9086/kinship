/** 状态空间切分是键盘、工具栏与输入事务的共同入口；组合输入保留浏览器原生行为。 */
import { zodCalibur, zodState } from "calibur-router/zod";
export type EditorAction = "native" | "ignore" | "save" | "undo" | "redo" | "bold" | "italic" | "strike" | "code" | "base" | "heading" | "paragraph" | "codeBlock" | "quote" | "divider" | "break";
const editable = { mode: zodState.literal("editable"), alt: zodState.literal(false) };
const primary = { ...editable, primary: zodState.literal(true) };
const keySchema = zodState.object({ mode: zodState.enumerated("locked", "composing", "editable"), key: zodState.string(),
  primary: zodState.boolean(), shift: zodState.boolean(), alt: zodState.boolean() });
// 锁定正文仍需Tab离开、方向键选择、复制冲突草稿；实际内容修改由事务入口再次拒绝。
const dispatchLockedKey = zodCalibur.universe(keySchema)
  .split(zodState.object({ key: zodState.enumerated("tab", "escape", "arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end", "pageup", "pagedown") }), () => "native" as const)
  .split(zodState.object({ primary: zodState.literal(true), key: zodState.enumerated("a", "c") }), () => "native" as const)
  .otherwise(() => "ignore" as const).build();
export const dispatchEditorKey = zodCalibur.universe(keySchema)
  .split(zodState.object({ mode: zodState.literal("locked") }), state => dispatchLockedKey(state))
  .split(zodState.object({ mode: zodState.literal("composing") }), () => "native" as const)
  .split(zodState.object({ ...primary, key: zodState.enumerated("enter", "s") }), () => "save" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("z"), shift: zodState.literal(false) }), () => "undo" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("z"), shift: zodState.literal(true) }), () => "redo" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("y") }), () => "redo" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("b") }), () => "bold" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("i") }), () => "italic" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("d") }), () => "strike" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("e") }), () => "code" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("heading") }), () => "heading" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("paragraph") }), () => "paragraph" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("codeblock") }), () => "codeBlock" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("quote") }), () => "quote" as const)
  .split(zodState.object({ ...primary, key: zodState.literal("divider") }), () => "divider" as const)
  .split(zodState.object({ ...editable, primary: zodState.literal(false), key: zodState.literal("enter"), shift: zodState.literal(true) }), () => "break" as const)
  .split(zodState.object({ ...editable, primary: zodState.literal(false), key: zodState.literal("enter"), shift: zodState.literal(false) }), () => "base" as const)
  .split(zodState.object({ ...editable, primary: zodState.literal(false), key: zodState.enumerated("backspace", "delete") }), () => "base" as const)
  .otherwise(() => "native" as const)
  .build();
// 保存中仍允许选择文本；只有会改变正文的事务被阻止。
export const acceptsEditorTransaction = zodCalibur.universe(zodState.object({ locked: zodState.boolean(), changed: zodState.boolean() }))
  .split(zodState.object({ locked: zodState.literal(true), changed: zodState.literal(true) }), () => false)
  .otherwise(() => true).build();

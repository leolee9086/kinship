/** 编辑器视图生命周期及命令执行；所有交互先经状态空间路由，存储通过上层DataAdapter。 */
import { EditorState, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import type { DocumentBody } from "../contracts/document";
import { newId } from "../domain/concepts";
import { editorSchema as schema } from "./schema";
import { blockIdentityPlugin } from "./blockIdentity";
import { toEditorDocument, fromEditorDocument } from "./documentCodec";
import { dispatchEditorKey, acceptsEditorTransaction, type EditorAction } from "./commandRouter";
export interface EditorCallbacks { locked(): boolean; changed(body: DocumentBody): void; save(): void; error(message: string): void }
export function createEditor(host: HTMLElement, body: DocumentBody, callbacks: EditorCallbacks) {
  const state = EditorState.create({ schema, doc: toEditorDocument(body), plugins: [history(), blockIdentityPlugin] });
  let view: EditorView;
  const run = (action: EditorAction, key = "Enter"): boolean => {
    if (action === "native") return false;
    if (action === "ignore") return true;
    if (action === "save") { callbacks.save(); return true; }
    const command: Command | undefined = { undo, redo, bold: toggleMark(schema.marks.strong), italic: toggleMark(schema.marks.em),
      strike: toggleMark(schema.marks.strike), code: toggleMark(schema.marks.code),
      paragraph: setBlockType(schema.nodes.paragraph), heading: setBlockType(schema.nodes.heading, { level: 2 }),
      codeBlock: setBlockType(schema.nodes.code_block), quote: wrapIn(schema.nodes.blockquote),
      divider: ((current, dispatch) => { dispatch?.(current.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create({ id: newId() })).scrollIntoView()); return true; }) as Command,
      break: ((current, dispatch) => { if (!current.selection.$from.parent.inlineContent) return false;
        dispatch?.(current.selection.$from.parent.type.spec.code ? current.tr.insertText("\n").scrollIntoView()
          : current.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }) as Command,
      base: baseKeymap[key],
    }[action];
    const handled = command?.(view.state, view.dispatch, view) ?? false;
    // 结构删除失败时交还原生字符删除，避免把块内部Backspace/ Delete吞掉。
    return action === "base" ? handled : true;
  };
  view = new EditorView(host, { state, editable: () => !callbacks.locked(),
    attributes: { role: "textbox", "aria-label": "正文编辑区", "aria-multiline": "true", tabindex: "0", spellcheck: "true" },
    handleKeyDown: (_view, event) => {
      const mode = callbacks.locked() ? "locked" : view.composing || event.isComposing || event.keyCode === 229 ? "composing" : "editable";
      const action = dispatchEditorKey({ mode, key: event.key.toLowerCase(), primary: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey });
      return run(action, event.key);
    },
    dispatchTransaction: transaction => {
      if (!acceptsEditorTransaction({ locked: callbacks.locked(), changed: transaction.docChanged })) return;
      try {
        const result = view.state.applyTransaction(transaction);
        if (result.transactions.some(item => item.docChanged)) callbacks.changed(fromEditorDocument(result.state.doc));
        view.updateState(result.state);
      } catch (error) { callbacks.error(error instanceof Error ? error.message : String(error)); }
    },
  });
  return { view, command: (key: string) => {
    const mode = callbacks.locked() ? "locked" : view.composing ? "composing" : "editable";
    run(dispatchEditorKey({ mode, key, primary: true, shift: false, alt: false })); view.focus();
  }, refreshEditable: () => view.setProps({ editable: () => !callbacks.locked() }), destroy: () => view.destroy() };
}

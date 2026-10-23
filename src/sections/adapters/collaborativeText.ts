/** text/plain 的完整块内 CRDT 适配器；共享文本和撤销只存在于本模块内。 */
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { CrdtAdapter } from "../adapter";
import { YjsFileSession } from "./yjsSession";
import { yjsTextCodec } from "./yjsTextCodec";

export const collaborativeTextAdapter: CrdtAdapter = {
  mode: "crdt", contentType: "text/plain", codec: yjsTextCodec,
  mount(element, file, ordinal) {
    const content = document.createElement("div"), status = document.createElement("p"), retry = document.createElement("button");
    status.setAttribute("role", "status"); status.textContent = "正在装入协作状态…"; retry.textContent = "重试未确认的同步";
    element.append(content, retry, status);
    let session: YjsFileSession | undefined, view: EditorView | undefined, disposed = false;
    const report = (cause: unknown) => { if (!disposed) status.textContent = cause instanceof Error ? cause.message : String(cause); };
    retry.onclick = () => { if (session) void session.flush().then(() => { status.textContent = "同步已确认"; }).catch(report); };
    void YjsFileSession.open(file, report).then(opened => {
      if (disposed) { opened.destroy(); return; }
      session = opened;
      view = new EditorView({ parent: content, state: EditorState.create({
        doc: opened.text.toString(), extensions: [
          lineNumbers(), EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": `协作纯文本区段 ${ordinal}` }),
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          yCollab(opened.text, null, { undoManager: opened.undo }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return;
            status.textContent = "正在同步…";
            void opened.flush().then(() => { if (!disposed) status.textContent = "同步已确认"; }).catch(report);
          }),
        ],
      }) });
      status.textContent = "协作状态已装入";
    }).catch(report);
    return { async prepareUnmount() { try { await session?.flush(); return true; } catch (cause) { report(cause); return false; } }, setOrdinal(next) { ordinal = next; content.querySelector(".cm-content")?.setAttribute("aria-label", `协作纯文本区段 ${next}`); }, destroy() { disposed = true; view?.destroy(); session?.destroy(); element.replaceChildren(); } };
  },
};

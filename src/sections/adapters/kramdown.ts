/** 默认 Kramdown 适配器。所有主体状态均封装在 file 后面，不导入领域或命令模块。 */
import Vditor from "vditor";
import "vditor/dist/index.css";
import "./editors.css";
import type { WholeFileAdapter } from "../adapter";

export const kramdownAdapter: WholeFileAdapter = {
  mode: "whole-file", contentType: "text/x-kramdown",
  mount(element, file, ordinal) {
    const editorHost = document.createElement("div"), controls = document.createElement("div"), status = document.createElement("p");
    const save = document.createElement("button"), reload = document.createElement("button");
    editorHost.className = "kinship-kramdown-editor"; controls.className = "kinship-section-controls"; status.className = "kinship-section-status";
    save.textContent = "保存本区段"; reload.textContent = "重新读取文件";
    status.setAttribute("role", "status"); controls.append(save, reload); element.append(editorHost, controls, status);
    let editor: Vditor | undefined, baseline = "", dirty = false, saving = false, disposed = false, ready = false;
    const report = (cause: unknown) => { if (!disposed) status.textContent = cause instanceof Error ? cause.message : String(cause); };
    const load = async () => {
      const text = await file.read();
      if (disposed) return;
      baseline = text; editor!.setFileText(text); dirty = false; status.textContent = "文件已读取";
    };
    const store = async () => {
      if (!editor || !ready || saving) return;
      const text = editor.getFileText(); saving = true; save.disabled = true;
      try {
        await file.write(text);
        baseline = text; dirty = editor.getFileText() !== baseline;
        if (!disposed) status.textContent = dirty ? "已保存；另有未保存修改" : "本区段已保存";
      } catch (cause) { report(cause); }
      finally { saving = false; save.disabled = false; }
    };
    save.onclick = () => { void store(); };
    reload.onclick = () => { if (!dirty || window.confirm("重新读取会放弃本区段未保存文本，继续？")) void load().catch(report); };
    const unsubscribe = file.watch(() => {
      if (disposed || !ready || saving) return;
      if (dirty) status.textContent = "文件已有新版本；当前未保存文本已保留";
      else void load().catch(report);
    });
    const keydown = (event: KeyboardEvent) => {
      if (!event.isComposing && (event.ctrlKey || event.metaKey) && ["s", "Enter"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); void store();
      }
    };
    // 只发送普通 DOM 扩展事件，不知道图谱 UUID 或主体导航接口。
    const link = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || !editorHost.contains(anchor)) return;
      event.preventDefault(); element.dispatchEvent(new CustomEvent("kinship:open-link", {
        bubbles: true, detail: { href: anchor.getAttribute("href"), text: anchor.textContent },
      }));
    };
    element.addEventListener("keydown", keydown, true); element.addEventListener("click", link);
    void file.read().then(text => {
      if (disposed) return;
      baseline = text;
      editor = new Vditor(editorHost, {
        mode: "sv", value: text, height: 300, lang: "zh_CN",
        cdn: new URL("vditor", document.baseURI).href,
        cache: { enable: false }, counter: { enable: false },
        toolbar: ["undo", "redo", "bold", "italic", "list", "link", "code", "table"],
        // 显隐及焦点属于编辑器自身，正文主体不用识别工具栏DOM或编辑器内部状态。
        toolbarConfig: { revealOnFocus: true },
        preview: { mode: "both", actions: [], hljs: { enable: false } },
        input: () => {
          if (!ready || !editor) return;
          dirty = editor.getFileText() !== baseline; status.textContent = dirty ? "本区段有未保存修改" : "文件未修改";
        },
        after: () => {
          if (disposed || !editor) return;
          editor.setFileText(text); ready = true;
          editorHost.querySelector("textarea")?.setAttribute("aria-label", `Kramdown 区段 ${ordinal}`);
          status.textContent = "文件已读取";
        },
      });
    }).catch(report);
    return { async prepareUnmount() { return !dirty && !saving; }, setOrdinal(next) { ordinal = next; editorHost.querySelector("textarea")?.setAttribute("aria-label", `Kramdown 区段 ${next}`); }, destroy() {
      disposed = true; unsubscribe(); element.removeEventListener("keydown", keydown, true);
      element.removeEventListener("click", link); editor?.destroy(); element.replaceChildren();
    } };
  },
};

/** 纯文本 CRDT 的存储投影，与 CodeMirror 视图解耦；主体只使用这个二进制编解码契约。 */
import * as Y from "yjs";
import type { CrdtCodec } from "../adapter";
export const yjsTextCodec: CrdtCodec = {
  initialize(text) {
    const doc = new Y.Doc();
    try { doc.getText("text").insert(0, text); return Y.encodeStateAsUpdate(doc); }
    finally { doc.destroy(); }
  },
  merge(state, update) {
    // 候选文档不是客户端的编辑会话；失败时丢弃候选，不触及已提交二进制状态。
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, state); Y.applyUpdate(doc, update);
      return { state: Y.encodeStateAsUpdate(doc), text: doc.getText("text").toString() };
    } finally { doc.destroy(); }
  },
  text(state) {
    const doc = new Y.Doc();
    try { Y.applyUpdate(doc, state); return doc.getText("text").toString(); }
    finally { doc.destroy(); }
  },
};

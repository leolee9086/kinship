/** 编辑器分裂/粘贴可能复制attrs；同一文档中旧块保留UUID，新块获得新UUID。 */
import { Plugin, type Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { isUUID, newId } from "../domain/concepts";
export function normalizeBlockIds(document: Node, transaction: Transaction, retained: ReadonlyMap<string, number> = new Map()): Transaction {
  const used = new Set<string>();
  document.descendants((node, position) => {
    if (!node.isBlock) return;
    let id: unknown = node.attrs.id;
    if (!isUUID(id) || used.has(id) || (retained.has(id) && retained.get(id) !== position)) {
      id = newId(); transaction.setNodeMarkup(position, undefined, { ...node.attrs, id });
    }
    used.add(id as string);
  });
  return transaction;
}
export const blockIdentityPlugin = new Plugin({
  appendTransaction: (transactions, before, state) => {
    if (!transactions.some(transaction => transaction.docChanged)) return null;
    const existing = new Set<string>();
    state.doc.descendants(node => { if (node.isBlock && isUUID(node.attrs.id)) existing.add(node.attrs.id); });
    let transaction = state.tr;
    state.doc.descendants((node, position) => {
      if (!node.isBlock || isUUID(node.attrs.id)) return;
      // 文本块切换成标题/代码时节点属性可能被重建，用事务映射找回原身份。
      let oldPosition = position;
      for (const change of [...transactions].reverse()) oldPosition = change.mapping.invert().map(oldPosition);
      const prior = before.doc.nodeAt(oldPosition), id = prior?.attrs.id;
      if (prior?.isBlock && isUUID(id) && !existing.has(id)) {
        transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, id }); existing.add(id);
      }
    });
    const retained = new Map<string, number>();
    before.doc.descendants((node, oldPosition) => {
      if (!node.isBlock || !isUUID(node.attrs.id)) return;
      let position = oldPosition, deleted = false;
      for (const change of transactions) {
        const mapped = change.mapping.mapResult(position, 1); position = mapped.pos; deleted ||= mapped.deleted;
      }
      // 粘贴在原块之前时，原块映射到后方；先给它保留身份，不能让前面的副本抢走UUID。
      if (!deleted && transaction.doc.nodeAt(position)?.attrs.id === node.attrs.id) retained.set(node.attrs.id, position);
    });
    transaction = normalizeBlockIds(transaction.doc, transaction, retained);
    return transaction.docChanged ? transaction : null;
  },
});

/** 真实 Yjs 会话与文件边界验收：并发、拒绝、重连和撤销，避免复制实现逻辑。 */
import { expect, it } from "vitest";
import * as Y from "yjs";
import { ValidationHost } from "./validationHost";
import { validateSectionText } from "./boundary";
import { dispatchFileCommand } from "./fileCommands";
import { yjsTextCodec } from "./adapters/yjsTextCodec";
import { YjsFileSession } from "./adapters/yjsSession";
const create = (text = "协作原文") => new ValidationHost(yjsTextCodec, {
  whole: { text: "# 原文\n\n{: custom=\"kept\"}\n\u00a0\n\n", version: 1 }, crdt: yjsTextCodec.initialize(text),
});
const edit = (session: YjsFileSession, run: () => void) => {
  const origin = Symbol("local editor"); session.undo.addTrackedOrigin(origin);
  session.doc.transact(run, origin); session.undo.stopCapturing();
};
it("whole-file exposes only text operations, preserves exact text and rejects stale whole-section saves", async () => {
  const host = create(), a = host.textFile(), b = host.textFile();
  expect(Object.keys(a).sort()).toEqual(["read", "watch", "write"]);
  const original = await a.read(); await b.read(); await a.write(original);
  expect(host.text()).toBe(original);
  await expect(b.write("另一份完整文本")).rejects.toThrow("版本冲突");
  expect(host.text()).toBe(original); expect(host.history).toHaveLength(1);
});
it("rejects destructive separators outside fences without escaping or changing either section", async () => {
  const host = create(), file = host.textFile(), before = host.checkpoint(); await file.read();
  await expect(file.write("段内\n---\n{: #split}")).rejects.toThrow("分割线");
  expect(host.checkpoint()).toEqual(before); expect(host.history).toHaveLength(0);
  await file.write("````md\n---\n{: #literal}\n```\n````\n\n");
  expect(host.text()).toBe("````md\n---\n{: #literal}\n```\n````\n\n");
  expect(() => validateSectionText("~~~md\n未闭合")).toThrow("尚未闭合");
});
it("routes permissions and exact collaboration modes at the host, with no intermediate patch mode", () => {
  const state = { writable: true, exists: true, busy: false };
  expect(dispatchFileCommand({ ...state, mode: "whole-file", intent: "crdt-update" })).toBe("mode-mismatch");
  expect(dispatchFileCommand({ ...state, mode: "crdt", intent: "replace" })).toBe("mode-mismatch");
  expect(dispatchFileCommand({ ...state, mode: "crdt", intent: "crdt-update", writable: false })).toBe("forbidden");
});
it("merges edits from two real Yjs clients and only undoes the local client's edit", async () => {
  const host = create(), a = host.collaborativeFile(), b = host.collaborativeFile();
  const alice = await YjsFileSession.open(a.file, () => {}), bob = await YjsFileSession.open(b.file, () => {});
  try {
    edit(alice, () => alice.text.insert(0, "甲")); await alice.flush();
    edit(bob, () => bob.text.insert(bob.text.length, "乙")); await bob.flush();
    expect(alice.text.toString()).toBe("甲协作原文乙"); expect(bob.text.toString()).toBe(alice.text.toString());
    alice.undo.undo(); await alice.flush();
    expect(host.collaborativeText()).toBe("协作原文乙"); expect(bob.text.toString()).toBe("协作原文乙");
    expect(host.text()).toBe("# 原文\n\n{: custom=\"kept\"}\n\u00a0\n\n");
  } finally { alice.destroy(); bob.destroy(); a.close(); b.close(); }
});
it("retains offline edits, rejoins without duplicate initial text and preserves causal state in a checkpoint", async () => {
  const host = create(), a = host.collaborativeFile(), b = host.collaborativeFile();
  const alice = await YjsFileSession.open(a.file, () => {}), bob = await YjsFileSession.open(b.file, () => {});
  try {
    a.setOnline(false); edit(alice, () => alice.text.insert(0, "离线")); await alice.flush();
    edit(bob, () => bob.text.insert(bob.text.length, "远端")); await bob.flush();
    expect(alice.text.toString()).toBe("离线协作原文"); a.setOnline(true);
    expect(alice.text.toString()).toBe("离线协作原文远端"); expect(bob.text.toString()).toBe(alice.text.toString());
    const recovered = new ValidationHost(yjsTextCodec, host.checkpoint()), endpoint = recovered.collaborativeFile();
    const reopened = await YjsFileSession.open(endpoint.file, () => {});
    expect(reopened.text.toString()).toBe(alice.text.toString());
    expect(Y.encodeStateVector(reopened.doc)).toEqual(Y.encodeStateVector(alice.doc));
    reopened.destroy(); endpoint.close();
  } finally { alice.destroy(); bob.destroy(); a.close(); b.close(); }
});
it("retains rejected CRDT dependencies so a corrected local edit can commit without rebuilding the session", async () => {
  const host = create(), connection = host.collaborativeFile(), failures: unknown[] = [];
  const session = await YjsFileSession.open(connection.file, error => { failures.push(error); });
  try {
    edit(session, () => session.text.insert(session.text.length, "\n---\n{: #split}"));
    await expect(session.flush()).rejects.toThrow("分割线"); expect(host.collaborativeText()).toBe("协作原文");
    const marker = session.text.toString().indexOf("{: #split}"); edit(session, () => session.text.delete(marker, 10));
    await session.flush(); expect(host.collaborativeText()).toBe("协作原文\n---\n"); expect(failures.length).toBeGreaterThan(0);
  } finally { session.destroy(); connection.close(); }
});
it("rejects a forbidden boundary formed only by merging two individually valid offline edits, then accepts a repair", async () => {
  const host = create("-\n{: #split}"), a = host.collaborativeFile(), b = host.collaborativeFile();
  const alice = await YjsFileSession.open(a.file, () => {}), bob = await YjsFileSession.open(b.file, () => {});
  try {
    a.setOnline(false); b.setOnline(false);
    edit(alice, () => alice.text.insert(0, "-")); edit(bob, () => bob.text.insert(0, "-"));
    await Promise.all([alice.flush(), bob.flush()]); a.setOnline(true);
    expect(() => b.setOnline(true)).toThrow("分割线"); expect(host.collaborativeText()).toBe("--\n{: #split}");
    const position = bob.text.toString().indexOf("{: #split}"); edit(bob, () => bob.text.delete(position, 10));
    await bob.flush(); b.setOnline(true);
    expect(host.collaborativeText()).toBe("---\n"); expect(alice.text.toString()).toBe(bob.text.toString());
  } finally { alice.destroy(); bob.destroy(); a.close(); b.close(); }
});

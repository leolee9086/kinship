/** 主体提供给适配器的文件实现。UUID、文件版本、RPC 和未知结果重试都止于此处。 */
import type { Commit, Operation } from "../contracts/commands";
import type { DocumentBlock } from "../contracts/document";
import { RpcError, fail } from "../contracts/errors";
import { newId } from "../domain/concepts";
import { decodeBinary, encodeBinary } from "../sections/binary";
import type { CrdtFile, TextFile } from "../sections/adapter";
import { crdtCodec } from "../sections/codecs";
import type { RpcClient } from "./rpcClient";
type FileOperation = Extract<Operation, { type: "document.replaceFile" | "document.updateCrdt" }>;
export function createSectionFiles(client: RpcClient, ready: () => Promise<unknown>, apply: (commit: Commit) => unknown) {
  const read = async (id: string, fileId: string) => {
    await ready(); const record = await client.call("readConcept", { id });
    if (record.concept.id !== id) fail("INTERNAL_ERROR", "读取结果不属于请求概念");
    const block = record.concept.body?.blocks.find(item => item.id === fileId);
    if (!block) fail("NOT_FOUND", "正文文件不存在", { id: fileId });
    return block;
  };
  const file = (id: string, fileId: string, mode: DocumentBlock["mode"]) => {
    let baseVersion: number | undefined, seenVersion = 0;
    let pending: { commandId: string; operation: FileOperation } | undefined, running = false;
    const listeners = new Set<(block: DocumentBlock) => void>();
    let timer: ReturnType<typeof setInterval> | undefined, channel: BroadcastChannel | undefined, polling = false;
    const check = (block: DocumentBlock) => {
      if (block.mode !== mode) fail("DOMAIN_CONSTRAINT", "文件模式与适配器不匹配", { id: fileId });
      return block;
    };
    const notify = (block: DocumentBlock) => {
      check(block);
      if (block.version <= seenVersion) return;
      seenVersion = block.version; for (const listener of listeners) listener(block);
    };
    const poll = async () => {
      if (polling) return; polling = true;
      try { notify(await read(id, fileId)); }
      catch { /* 临时断线不丢弃文件或草稿，下一次读取/提交仍会明确报告错误。 */ }
      finally { polling = false; }
    };
    const subscribe = (listener: (block: DocumentBlock) => void) => {
      listeners.add(listener);
      if (!timer) {
        // 同页/跨页本地通知加速；定期读取同一POST协议也支持远端后端和漏消息恢复。
        timer = setInterval(() => { void poll(); }, 1000);
        if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
          channel = new BroadcastChannel(`kinship:file:${id}:${fileId}`); channel.onmessage = () => { void poll(); };
        }
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { clearInterval(timer); timer = undefined; channel?.close(); channel = undefined; }
      };
    };
    const commitPending = async (): Promise<DocumentBlock> => {
      const request = pending!;
      try {
        await ready();
        const commit = await client.call("apply", { operations: [request.operation] }, { commandId: request.commandId });
        const changes = commit.changes, record = changes.put[0];
        const block = record?.concept.body?.blocks.find(item => item.id === fileId);
        if (changes.put.length !== 1 || record?.concept.id !== id || !block || block.mode !== mode
          || changes.removed.length || changes.presentation || changes.viewState || changes.media?.length || changes.removedMedia?.length)
          fail("RESULT_UNKNOWN", "文件提交响应与请求不符；请保留文本并重试", { commandId: request.commandId }, true);
        if (request.operation.type === "document.replaceFile") {
          if (block.mode !== "whole-file" || block.text !== request.operation.text || block.version !== request.operation.expectedVersion + 1)
            fail("RESULT_UNKNOWN", "文件响应没有确认完整文本，请重试原提交", { commandId: request.commandId }, true);
        } else if (block.mode === "crdt") {
          const state = decodeBinary(block.state), merged = crdtCodec(block.contentType).merge(state, decodeBinary(request.operation.update));
          if (encodeBinary(merged.state) !== block.state)
            fail("RESULT_UNKNOWN", "协作响应未包含完整增量，请重试原提交", { commandId: request.commandId }, true);
        }
        apply(commit); pending = undefined; baseVersion = block.version;
        notify(block); channel?.postMessage("committed"); return block;
      } catch (cause) {
        if (!(cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN")) pending = undefined;
        throw cause;
      }
    };
    const write = async (value: string) => {
      if (running) throw new Error("此文件正在提交，请稍后重试"); running = true;
      try {
        if (pending) {
          const prior = pending.operation;
          await commitPending();
          if ((prior.type === "document.replaceFile" ? prior.text : prior.update) === value) return;
        }
        if (mode === "whole-file") {
          if (baseVersion === undefined) throw new Error("保存前必须先读取文件");
          pending = { commandId: newId(), operation: { type: "document.replaceFile", id, fileId, expectedVersion: baseVersion, text: value } };
        } else pending = { commandId: newId(), operation: { type: "document.updateCrdt", id, fileId, update: value } };
        await commitPending();
      } finally { running = false; }
    };
    const load = async () => {
      const block = check(await read(id, fileId)); baseVersion = block.version;
      seenVersion = Math.max(seenVersion, block.version); return block;
    };
    return { load, write, subscribe };
  };
  return {
    textFile(id: string, fileId: string): TextFile {
      const connection = file(id, fileId, "whole-file");
      return Object.freeze({ read: async () => { const block = await connection.load(); if (block.mode !== "whole-file") fail("DOMAIN_CONSTRAINT", "文件不是整文件模式"); return block.text; },
        write: connection.write, watch: (changed: (text: string) => void) => connection.subscribe(block => { if (block.mode === "whole-file") changed(block.text); }) });
    },
    crdtFile(id: string, fileId: string): CrdtFile {
      const connection = file(id, fileId, "crdt");
      return Object.freeze({ load: async () => { const block = await connection.load(); if (block.mode !== "crdt") fail("DOMAIN_CONSTRAINT", "文件不是协作模式"); return decodeBinary(block.state); },
        publish: (update: Uint8Array) => connection.write(encodeBinary(update)),
        watch: (changed: (update: Uint8Array) => void) => connection.subscribe(block => { if (block.mode === "crdt") changed(decodeBinary(block.state)); }) });
    },
  };
}

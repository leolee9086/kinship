/** 独立验证页的内存主体，不接入真实图谱或替代其存储；验证适配器只依赖约定端口。 */
import type { CrdtCodec, CrdtFile, TextFile } from "./adapter";
import { validateSectionText } from "./boundary";
import { dispatchFileCommand } from "./fileCommands";
export interface ValidationCheckpoint { whole: { text: string; version: number }; crdt: Uint8Array }
interface Endpoint { online: boolean; state: Uint8Array; pending: Uint8Array[]; listeners: Set<(update: Uint8Array) => void> }
export interface ValidationConnection { file: CrdtFile; setOnline(online: boolean): void; close(): void }
export class ValidationHost {
  private whole: ValidationCheckpoint["whole"];
  private crdt: Uint8Array;
  private readonly textWatchers = new Set<(text: string) => void>();
  private readonly endpoints = new Set<Endpoint>();
  readonly history: { mode: "whole-file" | "crdt"; text: string; update?: Uint8Array }[] = [];
  constructor(private readonly codec: CrdtCodec, checkpoint: ValidationCheckpoint, private readonly writable = true) {
    validateSectionText(checkpoint.whole.text); validateSectionText(codec.text(checkpoint.crdt));
    this.whole = { ...checkpoint.whole }; this.crdt = checkpoint.crdt.slice();
  }
  private authorize(mode: "whole-file" | "crdt", intent: "replace" | "crdt-update"): void {
    const decision = dispatchFileCommand({ mode, intent, writable: this.writable, exists: true, busy: false });
    if (decision !== intent) throw new Error(`文件操作被主体拒绝：${decision}`);
  }
  textFile(): TextFile {
    let baseVersion: number | undefined;
    return Object.freeze({
      read: async () => { baseVersion = this.whole.version; return this.whole.text; },
      write: async (text: string) => {
        this.authorize("whole-file", "replace");
        if (baseVersion === undefined) throw new Error("请先读取文件");
        if (baseVersion !== this.whole.version) throw new Error("文件版本冲突；本次文本未保存，请保留草稿后重新读取");
        validateSectionText(text);
        this.whole = { text, version: this.whole.version + 1 }; baseVersion = this.whole.version;
        this.history.push({ mode: "whole-file", text });
        for (const changed of this.textWatchers) changed(text);
      },
      watch: (changed: (text: string) => void) => { this.textWatchers.add(changed); return () => { this.textWatchers.delete(changed); }; },
    });
  }
  collaborativeFile(): ValidationConnection {
    const endpoint: Endpoint = { online: true, state: this.crdt.slice(), pending: [], listeners: new Set() };
    this.endpoints.add(endpoint);
    const deliver = (target: Endpoint, update: Uint8Array) => {
      target.state = this.codec.merge(target.state, update).state;
      for (const changed of target.listeners) changed(update.slice());
    };
    const commit = (updates: Uint8Array[]) => {
      let candidate = { state: this.crdt, text: this.codec.text(this.crdt) };
      for (const update of updates) candidate = this.codec.merge(candidate.state, update);
      validateSectionText(candidate.text); this.crdt = candidate.state;
      for (const update of updates) this.history.push({ mode: "crdt", text: candidate.text, update: update.slice() });
      for (const target of this.endpoints) if (target.online) deliver(target, this.crdt);
    };
    const file: CrdtFile = Object.freeze({
      load: async () => endpoint.state.slice(),
      publish: async (update: Uint8Array) => {
        this.authorize("crdt", "crdt-update");
        if (!this.endpoints.has(endpoint)) throw new Error("协作文件已关闭");
        if (endpoint.online) commit([update]);
        else {
          const candidate = this.codec.merge(endpoint.state, update); validateSectionText(candidate.text);
          endpoint.state = candidate.state; endpoint.pending.push(update.slice());
        }
      },
      watch: (changed: (update: Uint8Array) => void) => { endpoint.listeners.add(changed); return () => { endpoint.listeners.delete(changed); }; },
    });
    return {
      file,
      setOnline: online => {
        if (!online) { endpoint.online = false; return; }
        // 一次验证全部离线更新与远端的合并结果，失败保留队列和离线文本。
        if (endpoint.pending.length) commit(endpoint.pending);
        endpoint.online = true; endpoint.pending = []; deliver(endpoint, this.crdt);
      },
      close: () => { endpoint.listeners.clear(); this.endpoints.delete(endpoint); },
    };
  }
  checkpoint(): ValidationCheckpoint { return { whole: { ...this.whole }, crdt: this.crdt.slice() }; }
  text(): string { return this.whole.text; }
  collaborativeText(): string { return this.codec.text(this.crdt); }
}

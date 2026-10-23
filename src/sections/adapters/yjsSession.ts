/** 完整 CRDT 状态属于适配器。主体传输二进制，不接触 Y.Text 或编辑器选区。 */
import * as Y from "yjs";
import type { CrdtFile } from "../adapter";
const REMOTE = Symbol("committed file update");
export class YjsFileSession {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText("text");
  readonly undo = new Y.UndoManager(this.text, { trackedOrigins: new Set() });
  private pending: Uint8Array | undefined;
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private readonly stopWatching: () => void;
  private readonly update = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    this.pending = this.pending ? Y.mergeUpdates([this.pending, update]) : update;
    void this.flush().catch(this.failed);
  };
  private constructor(private readonly file: CrdtFile, private readonly failed: (cause: unknown) => void) {
    // 先订阅再 load，异步读取期间的增量也不会丢；Yjs 能幂等合并重复状态。
    this.stopWatching = file.watch(update => {
      if (this.stopped) return;
      try { Y.applyUpdate(this.doc, update, REMOTE); void this.flush().catch(this.failed); }
      catch (cause) { this.failed(cause); }
    });
  }
  static async open(file: CrdtFile, failed: (cause: unknown) => void): Promise<YjsFileSession> {
    const session = new YjsFileSession(file, failed);
    try {
      Y.applyUpdate(session.doc, await file.load(), REMOTE);
      session.doc.on("update", session.update); return session;
    } catch (cause) { session.destroy(); throw cause; }
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    // 延后一轮开始，先登记 in-flight，避免同步通知在 publish 中重入 flush。
    this.flushing = Promise.resolve().then(() => this.commitPending()).finally(() => { this.flushing = undefined; });
    return this.flushing;
  }
  private async commitPending(): Promise<void> {
    while (this.pending && !this.stopped) {
      const update = this.pending; this.pending = undefined;
      try { await this.file.publish(update); }
      catch (cause) {
        // 保留完整因果增量；文件端在结果不明时负责先重试原请求，再接受后续候选。
        this.pending = this.pending ? Y.mergeUpdates([update, this.pending]) : update;
        throw cause;
      }
    }
  }
  destroy(): void {
    this.stopped = true; this.stopWatching(); this.doc.off("update", this.update); this.undo.destroy(); this.doc.destroy();
  }
}

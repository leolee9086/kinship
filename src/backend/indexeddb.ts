/**
 * 新概念仓库的 IndexedDB 后端。没有旧库探测、迁移或双写分支。
 * 写操作只在事务 oncomplete 后成功；不能把 request.onsuccess 当作已持久化。
 */
import { C, newId, type Concept, type ConceptMutation, type ConceptSnapshot, type GraphSettings, type StoredMedia, type MediaInfo } from "../domain/concepts";
import { initialSnapshot } from "../domain/ontology";
import { applyMutation, InputError, validateConcepts, validateSettings, uuid } from "../domain/validation";
import { MAX_MEDIA_BYTES, MEDIA_TYPES, type GraphRepository } from "./repository";

interface State { id: "graph"; version: 1; settings: GraphSettings; revision: number }
const CONCEPTS = "concepts", STATE = "state", MEDIA = "media";

export class IndexedDbRepository implements GraphRepository {
  private opening: Promise<IDBDatabase>;
  private writes: Promise<unknown> = Promise.resolve();

  /** name 注入用于隔离测试，默认库绝不读取旧版 kinship。 */
  constructor(name = "kinship-concepts", factory: IDBFactory = indexedDB) {
    this.opening = new Promise((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const concepts = db.createObjectStore(CONCEPTS, { keyPath: "id" });
        const state = db.createObjectStore(STATE, { keyPath: "id" });
        db.createObjectStore(MEDIA, { keyPath: "id" });
        const initial = initialSnapshot();
        validateConcepts(initial.concepts);
        for (const concept of initial.concepts) concepts.put(concept);
        state.put({ id: "graph", version: 1, settings: initial.settings, revision: 0 } satisfies State);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("无法打开概念仓库"));
      request.onblocked = () => reject(new Error("概念仓库被其他页面占用，请关闭旧页面后重试"));
    });
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.writes.then(work);
    // 本次错误继续向调用者抛出，但不把之后的保存永久锁死。
    this.writes = result.then(() => undefined, () => undefined);
    return result;
  }

  async load(): Promise<ConceptSnapshot> {
    await this.writes;
    const db = await this.opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONCEPTS, STATE], "readonly");
      const concepts = tx.objectStore(CONCEPTS).getAll();
      const state = tx.objectStore(STATE).get("graph");
      tx.oncomplete = () => {
        const s = state.result as State | undefined;
        if (!s) { reject(new Error("概念仓库缺少状态记录")); return; }
        resolve({ version: 1, concepts: concepts.result as Concept[], settings: s.settings, revision: s.revision });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("读取事务中止"));
    });
  }

  mutate(input: ConceptMutation): Promise<ConceptSnapshot> {
    return this.serialize(async () => {
      const db = await this.opening;
      return new Promise((resolve, reject) => {
        const tx = db.transaction([CONCEPTS, STATE], "readwrite");
        const store = tx.objectStore(CONCEPTS), stateStore = tx.objectStore(STATE);
        const records = store.getAll(), state = stateStore.get("graph");
        let next: ConceptSnapshot;
        let count = 0;
        const ready = () => {
          if (++count !== 2) return;
          try {
            const old = state.result as State;
            if (!old) throw new Error("概念仓库缺少状态记录");
            const removed = new Set(input.remove ?? []);
            const configured = Object.values(old.settings.perspective.overrides).flatMap(r => [...Object.keys(r.relations), ...Object.keys(r.concepts)]);
            if (configured.some(id => removed.has(id))) throw new InputError("该分类仍被视角配置引用，请先恢复或修改视角规则");
            const concepts = applyMutation(records.result as Concept[], input);
            const ids = new Set(concepts.map(c => c.id));
            const settings = { ...old.settings,
              focusId: old.settings.focusId && ids.has(old.settings.focusId) ? old.settings.focusId : null,
              expandedRelations: old.settings.expandedRelations.filter(id => ids.has(id)) };
            for (const c of input.put ?? []) store.put(c);
            for (const id of input.remove ?? []) store.delete(id);
            const updated: State = { ...old, settings, revision: old.revision + 1 };
            stateStore.put(updated);
            next = { version: 1, concepts, settings, revision: updated.revision };
          } catch (error) { tx.abort(); reject(error); }
        };
        records.onsuccess = ready; state.onsuccess = ready;
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("概念写入事务中止"));
      });
    });
  }

  saveSettings(input: GraphSettings): Promise<GraphSettings> {
    return this.serialize(async () => {
      const settings = validateSettings(input);
      const db = await this.opening;
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STATE, CONCEPTS, MEDIA], "readwrite");
        const stateStore = tx.objectStore(STATE), concepts = tx.objectStore(CONCEPTS);
        const state = stateStore.get("graph");
        const checks: IDBRequest[] = [];
        if (settings.focusId) checks.push(concepts.get(settings.focusId));
        for (const id of settings.expandedRelations) checks.push(concepts.get(id));
        const ruleIds = new Set(Object.values(settings.perspective.overrides).flatMap(r => [...Object.keys(r.relations), ...Object.keys(r.concepts)]));
        const ruleConcepts = [...ruleIds].map(id => concepts.get(id));
        checks.push(...ruleConcepts);
        if (settings.background.mediaId) checks.push(tx.objectStore(MEDIA).get(settings.background.mediaId));
        let completed = 0;
        const ready = () => {
          if (++completed !== checks.length + 1) return;
          try {
            if (checks.some(r => !r.result)) throw new InputError("设置引用了不存在的概念或媒体");
            if (ruleConcepts.some(r => !(r.result as Concept).types.includes(C.type))) throw new InputError("视角分类必须引用类型概念");
            const old = state.result as State;
            if (!old) throw new Error("概念仓库缺少状态记录");
            stateStore.put({ ...old, settings });
          } catch (error) { tx.abort(); reject(error); }
        };
        state.onsuccess = ready; checks.forEach(r => { r.onsuccess = ready; });
        tx.oncomplete = () => resolve(settings);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("设置保存事务中止"));
      });
    });
  }

  upload(file: Blob, name: string): Promise<MediaInfo> {
    return this.serialize(async () => {
      if (!MEDIA_TYPES.has(file.type)) throw new InputError("支持 PNG/JPEG/WebP/AVIF/GIF 图片及 MP4/WebM/Ogg 视频", 415);
      if (!file.size || file.size > MAX_MEDIA_BYTES) throw new InputError("背景文件必须为 1 字节至 100 MiB", 413);
      if (!name.trim()) throw new InputError("上传文件需要名称");
      const record: StoredMedia = { id: newId(), name, type: file.type, size: file.size, createdAt: new Date().toISOString(), blob: file };
      const db = await this.opening;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA, "readwrite");
        tx.objectStore(MEDIA).put(record);
        tx.oncomplete = () => { const { blob: _, ...info } = record; resolve(info); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("媒体上传事务中止"));
      });
    });
  }

  async media(id: string): Promise<StoredMedia> {
    uuid(id);
    await this.writes;
    const db = await this.opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA, "readonly");
      const req = tx.objectStore(MEDIA).get(id);
      tx.oncomplete = () => {
        if (!req.result) reject(new InputError("背景媒体不存在", 404));
        else resolve(req.result as StoredMedia);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("媒体读取事务中止"));
    });
  }

  removeMedia(id: string): Promise<GraphSettings> {
    uuid(id);
    return this.serialize(async () => {
      const db = await this.opening;
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STATE, MEDIA], "readwrite");
        const stateStore = tx.objectStore(STATE), media = tx.objectStore(MEDIA);
        const state = stateStore.get("graph");
        let next: GraphSettings;
        state.onsuccess = () => {
          const old = state.result as State;
          if (!old) { tx.abort(); reject(new Error("概念仓库缺少状态记录")); return; }
          next = old.settings.background.mediaId === id
            ? { ...old.settings, background: { ...old.settings.background, mediaId: null } } : old.settings;
          stateStore.put({ ...old, settings: next });
          media.delete(id);
        };
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("媒体删除事务中止"));
      });
    });
  }

  async close(): Promise<void> { await this.writes; (await this.opening).close(); }
}

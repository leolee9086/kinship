/** 前端数据门面：编辑草稿编译成带资源版本的字段命令，界面不接触存储。 */
import type { Apply, Commit, Operation, ViewStateRecord } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { newId, type Concept, type ConceptMutation, type ConceptSnapshot, type GraphSettings, type MediaInfo } from "../domain/concepts";
import { sha256 } from "../format/digest";
import { RpcClient, type CallOptions } from "./rpcClient";
import { WorkspaceReplica } from "./replica";
import { conceptCommands } from "./conceptCommands";
import { settingsCommands } from "./settingsCommands";
import type { Dispatch } from "./transport";

export interface MutationOptions extends CallOptions {
  expectedVersions?: Record<string, number | null>;
  initialConcepts?: Record<string, Concept>;
}
export interface DataAdapter {
  load(): Promise<ConceptSnapshot>;
  execute(command: Apply, options?: CallOptions): Promise<Commit>;
  mutate(change: ConceptMutation, options?: MutationOptions): Promise<ConceptSnapshot>;
  saveSettings(settings: GraphSettings): Promise<GraphSettings>;
  upload(file: File, options?: CallOptions & { resourceId?: string }): Promise<MediaInfo>;
  mediaInfo(id: string): Promise<MediaInfo>;
  mediaContent(id: string): Promise<Blob>;
  removeMedia(id: string): Promise<GraphSettings>;
}
export function createHttpAdapter(dispatch: Dispatch): DataAdapter {
  const client = new RpcClient(dispatch);
  let replica: WorkspaceReplica | undefined, loading: Promise<ConceptSnapshot> | undefined;
  const load = async () => {
    if (!loading) loading = client.call("bootstrap", {}).then(result => {
      replica = new WorkspaceReplica(result); return replica.snapshot;
    }).finally(() => { loading = undefined; });
    return loading;
  };
  const ready = async () => { if (!replica) await load(); return replica!; };
  const execute = async (command: Apply, options?: CallOptions) => {
    await ready(); const commit = await client.call("apply", command, options); replica!.apply(commit); return commit;
  };
  return {
    load, execute,
    mutate: async (change, options) => {
      const current = (await ready()).snapshot, operations: Operation[] = [], records = new Map(current.concepts.map(c => [c.id, c]));
      for (const concept of change.put ?? []) {
        const version = options?.expectedVersions && concept.id in options.expectedVersions
          ? options.expectedVersions[concept.id] : current.conceptVersions[concept.id] ?? null;
        const initial = version === null ? undefined : options?.initialConcepts?.[concept.id] ?? records.get(concept.id);
        if (version !== null && !initial) fail("NOT_FOUND", "待编辑概念不在当前快照中", { id: concept.id });
        operations.push(...conceptCommands(concept, initial, version));
      }
      for (const id of change.remove ?? []) {
        const version = options?.expectedVersions && id in options.expectedVersions ? options.expectedVersions[id] : current.conceptVersions[id];
        if (version === undefined) fail("NOT_FOUND", "待删除的概念不在当前快照中", { id });
        if (version === null) fail("INVALID_REQUEST", "删除需要已有资源版本", { id });
        operations.push({ type: "concept.deleteUnreferenced", id, expectedVersion: version });
      }
      const removed = new Set(change.remove ?? []), fields: Partial<Pick<ViewStateRecord["data"], "focusId" | "expandedRelations">> = {};
      if (current.settings.focusId && removed.has(current.settings.focusId)) fields.focusId = null;
      if (current.settings.expandedRelations.some(id => removed.has(id))) fields.expandedRelations = current.settings.expandedRelations.filter(id => !removed.has(id));
      if (Object.keys(fields).length) operations.push({ type: "viewState.updateFields", expectedVersion: current.viewStateVersion, fields });
      if (operations.length) await execute({ operations }, options);
      return replica!.snapshot;
    },
    saveSettings: async settings => {
      const operations = settingsCommands((await ready()).snapshot, settings);
      if (operations.length) await execute({ operations }); return replica!.snapshot.settings;
    },
    upload: async (file, options) => {
      await ready();
      const params = { id: options?.resourceId ?? newId(), name: file.name, type: file.type, size: file.size, sha256: await sha256(file) };
      const commit = await client.call("upload", params, { ...options, file }); replica!.apply(commit);
      const result = commit.changes.media?.find(item => item.id === params.id);
      if (!result) fail("RESULT_UNKNOWN", "上传提交没有返回资源记录", { commandId: commit.commandId }, true);
      return result;
    },
    mediaInfo: async id => { await ready(); return client.call("mediaInfo", { id }); },
    mediaContent: async id => { await ready(); return client.call("mediaContent", { id }); },
    removeMedia: async id => {
      const current = (await ready()).snapshot, info = await client.call("mediaInfo", { id });
      const operations: Operation[] = [{ type: "media.remove", id, expectedVersion: info.version }];
      if (current.settings.background.mediaId === id) operations.push({ type: "viewState.updateFields", expectedVersion: current.viewStateVersion,
        fields: { background: { ...current.settings.background, mediaId: null } } });
      await execute({ operations }); return replica!.snapshot.settings;
    },
  };
}

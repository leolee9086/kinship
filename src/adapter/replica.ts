/** 本地视图副本应用提交增量。晚到响应按资源版本去重，不靠全库替换覆盖界面。 */
import type { Bootstrap } from "../contracts/rpc";
import type { Commit } from "../contracts/commands";
import type { ConceptSnapshot } from "../domain/concepts";
import { combineSettings, splitSettings } from "../domain/presentationState";

export class WorkspaceReplica {
  private baseRevision: number;
  snapshot: ConceptSnapshot;
  constructor(source: Bootstrap) {
    this.baseRevision = source.revision;
    this.snapshot = { version: 1, revision: source.revision, concepts: source.concepts.map(r => r.concept),
      conceptVersions: Object.fromEntries(source.concepts.map(r => [r.concept.id, r.version])),
      settings: combineSettings(source.presentation.data, source.viewState.data),
      presentationVersion: source.presentation.version, viewStateVersion: source.viewState.version };
  }
  apply(commit: Commit): ConceptSnapshot {
    const old = this.snapshot, delta = commit.changes, parts = splitSettings(old.settings);
    // 完整快照已包含这个边界以前的全部业务提交；旧重放不能复活已经删除的身份。
    const shared = commit.revision > this.baseRevision;
    let concepts = old.concepts, versions = old.conceptVersions;
    const put = shared ? delta.put.filter(r => r.version > (versions[r.concept.id] ?? 0)) : [];
    const removed = shared ? delta.removed.filter(r => r.version > (versions[r.id] ?? 0)) : [];
    if (put.length || removed.length) {
      const records = new Map(concepts.map(c => [c.id, c])); versions = { ...versions };
      for (const item of put) { records.set(item.concept.id, item.concept); versions[item.concept.id] = item.version; }
      for (const item of removed) { records.delete(item.id); versions[item.id] = item.version; }
      concepts = [...records.values()];
    }
    const presentation = shared && delta.presentation && delta.presentation.version > old.presentationVersion ? delta.presentation : undefined;
    const viewState = delta.viewState && delta.viewState.version > old.viewStateVersion ? delta.viewState : undefined;
    this.snapshot = { ...old, concepts, conceptVersions: versions, revision: Math.max(old.revision, commit.revision),
      settings: presentation || viewState ? combineSettings(presentation?.data ?? parts.presentation, viewState?.data ?? parts.viewState) : old.settings,
      presentationVersion: presentation?.version ?? old.presentationVersion, viewStateVersion: viewState?.version ?? old.viewStateVersion };
    return this.snapshot;
  }
}

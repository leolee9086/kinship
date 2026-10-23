/** 写正文只允许目标字段变化；异常回包保持原命令，不能把其它UUID或被改写的内容认作成功。 */
import type { Commit } from "../contracts/commands";
import type { DocumentBody } from "../contracts/document";
import type { Concept } from "../domain/concepts";
import { fail } from "../contracts/errors";
import { sameField } from "../format/fieldDiff";
export function verifyBodyCommit(commit: Commit, initial: Concept, body: DocumentBody, version: number) {
  const { changes } = commit, record = changes.put[0];
  if (changes.put.length !== 1 || !record || record.version !== version + 1 || !sameField(record.concept, { ...initial, body })
    || changes.removed.length || changes.presentation || changes.viewState || changes.media?.length || changes.removedMedia?.length || commit.importSource)
    fail("RESULT_UNKNOWN", "正文响应与原草稿不一致，请重试原命令", { commandId: commit.commandId }, true);
}

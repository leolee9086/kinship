/** 文件层词法仅识别围栏与区段分隔符，不解析适配器的内容 AST。 */
export class SectionStructureError extends Error {
  constructor(readonly line: number, message: string) { super(`第 ${line} 行：${message}`); this.name = "SectionStructureError"; }
}
const rule = /^(?: {0,3})(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const ial = /^\s*\{:\s*[^\r\n]*\}\s*$/;
export function validateSectionText(text: string): void {
  const lines = text.split(/\r?\n/);
  let fence: { character: string; length: number; line: number } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = { character: marker[1][0], length: marker[1].length, line: index + 1 }; continue;
    }
    if (rule.test(line) && ial.test(lines[index + 1] ?? ""))
      throw new SectionStructureError(index + 1, "区段内容不能包含围栏外的分割线＋IAL；请使用主体的区段结构操作");
  }
  // 未闭合围栏会吞掉序列化器追加的下一个区段边界，不能在提交后补写或猜测修复。
  if (fence) throw new SectionStructureError(fence.line, "代码围栏尚未闭合，会遮蔽后续区段边界");
}

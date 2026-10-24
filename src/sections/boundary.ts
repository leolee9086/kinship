/** 文件层词法仅识别围栏与区段分隔符，不解析适配器的内容 AST。 */
export class SectionStructureError extends Error {
  constructor(readonly line: number, message: string) { super(`第 ${line} 行：${message}`); this.name = "SectionStructureError"; }
}
const rule = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
export interface SectionBoundary { line: number; start: number; contentStart: number; ial: string }
/** 返回原文偏移，供传输格式剥离封套；普通文件保存复用同一个边界定义。 */
export function scanSectionBoundaries(text: string): SectionBoundary[] {
  const lines = text.split("\n"), boundaries: SectionBoundary[] = [];
  let fence: { character: string; length: number; line: number } | undefined, offset = 0;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index], line = raw.replace(/\r$/, ""), start = offset;
    offset += raw.length + 1;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = { character: marker[1][0], length: marker[1].length, line: index + 1 }; continue;
    }
    const next = (lines[index + 1] ?? "").replace(/\r$/, "");
    if (rule.test(line) && /^\s*\{:/.test(next)) {
      if (!/^\s*\{:[^\r\n]*\}\s*$/.test(next)) throw new SectionStructureError(index + 2, "区段 IAL 外壳未闭合");
      boundaries.push({ line: index + 1, start, contentStart: Math.min(text.length, offset + lines[index + 1].length + 1), ial: next });
    }
  }
  // 未闭合围栏会吞掉序列化器追加的下一个区段边界，不能在提交后补写或猜测修复。
  if (fence) throw new SectionStructureError(fence.line, "代码围栏尚未闭合，会遮蔽后续区段边界");
  return boundaries;
}
export function validateSectionText(text: string): void {
  const first = scanSectionBoundaries(text)[0];
  if (first) throw new SectionStructureError(first.line, "区段内容不能包含围栏外的分割线＋IAL；请使用主体的区段结构操作");
}

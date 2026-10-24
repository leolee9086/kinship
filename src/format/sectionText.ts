/** UTF-8/LF 区段文本封套：分割线和 IAL 描述后面的文件，正文保持字面值。 */
import { scanSectionBoundaries, SectionStructureError, validateSectionText } from "../sections/boundary";
import { parseSectionAttributes, type SectionAttributes } from "./sectionAttributes";
export interface TextSection { text: string; attributes: SectionAttributes | null; line: number }
export const SECTION_TEXT_LIMIT = 1048576;
const utf8 = new TextEncoder();
export function normalizeSectionText(text: string): string {
  // JS 孤立代理项无法以 UTF-8 无损传输，不能由 TextEncoder 静默写成替换字符。
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
    throw new SectionStructureError(1, "文本含不能传输为 UTF-8 的孤立代理项");
  const normalized = text.replace(/\r\n?/g, "\n");
  if (utf8.encode(normalized).byteLength > SECTION_TEXT_LIMIT) throw new SectionStructureError(1, "区段文本文件超过 1 MiB");
  return normalized;
}
export function parseSectionText(value: string): TextSection[] {
  const text = normalizeSectionText(value);
  if (!text) return [];
  const boundaries = scanSectionBoundaries(text);
  if (boundaries.length > 10000) throw new SectionStructureError(1, "区段数量超过 10000");
  const sections: TextSection[] = [];
  const content = (start: number, end: number, framed: boolean) => {
    const part = text.slice(start, end);
    // 每个后续封套前恰好一个 LF 属于格式层；内容自身的尾空行一字不裁剪。
    return framed && part.endsWith("\n") ? part.slice(0, -1) : part;
  };
  if (!boundaries.length) return [{ text, attributes: null, line: 1 }];
  if (boundaries[0].start > 0) sections.push({ text: content(0, boundaries[0].start, true), attributes: null, line: 1 });
  for (let index = 0; index < boundaries.length; index++) {
    const boundary = boundaries[index], next = boundaries[index + 1];
    sections.push({ text: content(boundary.contentStart, next?.start ?? text.length, !!next),
      attributes: parseSectionAttributes(boundary.ial, boundary.line + 1), line: boundary.line + 2 });
  }
  if (sections.length > 10000) throw new SectionStructureError(1, "区段数量超过 10000");
  return sections;
}
export function serializeSectionText(sections: readonly Pick<TextSection, "text" | "attributes">[]): string {
  if (sections.length > 10000) throw new SectionStructureError(1, "区段数量超过 10000");
  const envelopes = sections.map(section => {
    const text = normalizeSectionText(section.text); validateSectionText(text);
    const attributes = section.attributes ? parseSectionAttributes(section.attributes.raw).raw : "{:}";
    // 头部最后的 LF 属于封套；相邻区段之间再加一个 LF，永不借用正文末尾的 LF。
    return `---\n${attributes}\n${text}`;
  });
  return normalizeSectionText(envelopes.join("\n"));
}

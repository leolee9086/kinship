/** 区段 IAL 的小型词法器：保留原始 token，不执行引用，不解析正文语义。 */
import { SectionStructureError } from "../sections/boundary";
export interface IalToken { kind: "attribute" | "id" | "class" | "reference"; name: string; value: string; raw: string }
export interface SectionAttributes { raw: string; tokens: IalToken[]; values: Record<string, string> }
export function parseSectionAttributes(raw: string, line = 1): SectionAttributes {
  const invalid = (message: string): never => { throw new SectionStructureError(line, `IAL ${message}`); };
  if (raw.length > 8192) invalid("超过 8192 字符");
  const shell = /^\s*\{:(.*)\}\s*$/.exec(raw);
  if (!shell || /[\r\n]/.test(raw)) invalid("必须是单行闭合的 {: … }");
  const input = shell![1], tokens: IalToken[] = [], values: Record<string, string> = Object.create(null);
  let cursor = 0;
  const store = (token: IalToken) => {
    if (tokens.length >= 128) invalid("属性数量超过 128");
    if (token.kind !== "reference") {
      if (token.name === "class") values.class = values.class ? `${values.class} ${token.value}` : token.value;
      else {
        if (Object.hasOwn(values, token.name)) invalid(`属性 ${token.name} 重复`);
        values[token.name] = token.value;
      }
    }
    tokens.push(token);
  };
  while (cursor < input.length) {
    if (/\s/.test(input[cursor])) { cursor++; continue; }
    const start = cursor;
    // 引号里的空格、右花括号和转义字符都属于属性值，不能提前结束 token。
    if (input[cursor] === "." || input[cursor] === "#") {
      const shortcut = input[cursor++];
      while (cursor < input.length && !/\s/.test(input[cursor])) cursor++;
      const value = input.slice(start + 1, cursor);
      if (!value || /[{}'"\\]/.test(value)) invalid("快捷属性无效");
      store({ kind: shortcut === "." ? "class" : "id", name: shortcut === "." ? "class" : "id", value, raw: input.slice(start, cursor) });
      continue;
    }
    while (cursor < input.length && !/[\s=]/.test(input[cursor])) cursor++;
    const name = input.slice(start, cursor);
    if (!/^[\w:][\w:.-]*$/.test(name)) invalid("属性名或引用名无效");
    if (input[cursor] !== "=") {
      store({ kind: "reference", name, value: "", raw: input.slice(start, cursor) }); continue;
    }
    cursor++;
    let value = "";
    const quote = input[cursor];
    if (quote === '"' || quote === "'") {
      cursor++;
      let closed = false;
      while (cursor < input.length) {
        const character = input[cursor++];
        if (character === quote) { closed = true; break; }
        if (character === "\\" && (input[cursor] === quote || input[cursor] === "\\")) value += input[cursor++];
        else value += character;
      }
      if (!closed) invalid(`属性 ${name} 的引号未闭合`);
      if (cursor < input.length && !/\s/.test(input[cursor])) invalid("属性之间必须以空白分隔");
    } else {
      const valueStart = cursor;
      while (cursor < input.length && !/\s/.test(input[cursor])) cursor++;
      value = input.slice(valueStart, cursor);
      if (!value || /[{}'"]/.test(value)) invalid(`属性 ${name} 的值无效`);
    }
    store({ kind: "attribute", name, value, raw: input.slice(start, cursor) });
  }
  return { raw, tokens, values };
}

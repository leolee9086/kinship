import { describe, expect, it } from "vitest";
import { parseSectionAttributes } from "./sectionAttributes";
import { normalizeSectionText, parseSectionText, serializeSectionText } from "./sectionText";
import { validateSectionText } from "../sections/boundary";
const section = (text: string, ial = '{: id="sample"}') => ({ text, attributes: parseSectionAttributes(ial) });
describe("section text envelopes", () => {
  it("distinguishes an empty document, an explicit empty section, and plain text without a header", () => {
    expect(parseSectionText("")).toEqual([]);
    expect(parseSectionText("\n")).toMatchObject([{ text: "\n", attributes: null }]);
    expect(parseSectionText("---\n{:}\n")).toMatchObject([{ text: "", attributes: { raw: "{:}" } }]);
    expect(parseSectionText("---\n{:}")).toMatchObject([{ text: "", attributes: { raw: "{:}" } }]);
    expect(parseSectionText("孙悟空\n\n")).toMatchObject([{ text: "孙悟空\n\n", attributes: null }]);
    expect(serializeSectionText([])).toBe("");
  });
  it("preserves every file's trailing empty lines, NBSP, Unicode form, and unknown IAL", () => {
    const raw = '  {: foreign .one .two id="not-a-uuid" adapter="unknown" title=\'a } value\' }  ';
    for (let count = 0; count <= 5; count++) {
      const input = [section("e\u0301😀\u00a0" + "\n".repeat(count), raw), section(""), section("尾段" + "\n".repeat(count))];
      const serialized = serializeSectionText(input), parsed = parseSectionText(serialized);
      expect(parsed.map(file => file.text)).toEqual(input.map(file => file.text));
      expect(parsed[0].attributes?.raw).toBe(raw);
      expect(serializeSectionText(parsed)).toBe(serialized);
    }
  });
  it("recognizes standard adjacent headers while leaving ordinary horizontal rules alone", () => {
    for (const rule of ["---", " * * * ", "  _ _ _", "-\t-\t-"]) {
      const parsed = parseSectionText(`前言\n${rule}\n{: .foreign}\n正文`);
      expect(parsed.map(file => file.text)).toEqual(["前言", "正文"]);
      expect(parsed[1].line).toBe(4);
    }
    for (const text of ["---\n不是属性", "---\n\n{: #paragraph}", "    ---\n{: #code}", "-\u00a0-\u00a0-\n{: #text}"]) {
      expect(parseSectionText(text)).toMatchObject([{ text, attributes: null }]);
      expect(() => validateSectionText(text)).not.toThrow();
    }
  });
  it("does not split fake headers inside matching or longer fences", () => {
    const text = ["````md", "---", '{: id="fake"}', "```", "still inside", "````", "~~~js", "***", "{: .fake}", "~~~~"].join("\n");
    expect(parseSectionText(text)).toMatchObject([{ text, attributes: null }]);
    expect(parseSectionText(serializeSectionText([section(text), section("after")])).map(file => file.text)).toEqual([text, "after"]);
    expect(() => validateSectionText(text)).not.toThrow();
  });
  it("normalizes line endings to LF without normalizing Unicode or trimming text", () => {
    expect(parseSectionText("---\r\n{:}\r\n甲\r\n\u00a0\r\n\r\n")[0].text).toBe("甲\n\u00a0\n\n");
    expect(normalizeSectionText("a\rb\r\nc\n")).toBe("a\nb\nc\n");
    expect(parseSectionText("\uFEFFe\u0301")[0].text).toBe("\uFEFFe\u0301");
    expect(normalizeSectionText("😀")).toBe("😀");
    expect(() => normalizeSectionText("\uD800")).toThrow(/代理项/);
    expect(() => normalizeSectionText("\uDC00")).toThrow(/代理项/);
  });
  it("reports malformed headers and unterminated fences at the original source line", () => {
    expect(() => parseSectionText("序言\n---\n{: title=\"missing }\n正文")).toThrow(/第 3 行.*引号未闭合/);
    expect(() => parseSectionText("序言\n---\n{: missing\n正文")).toThrow(/第 3 行.*外壳未闭合/);
    expect(() => parseSectionText("开头\n```js\n---\n{:}\n")).toThrow(/第 2 行.*围栏尚未闭合/);
    expect(() => serializeSectionText([section("未闭合\n~~~")])).toThrow(/第 2 行/);
    expect(() => serializeSectionText([section("---\n{: #split}")])).toThrow(/第 1 行.*分割线/);
    expect(() => serializeSectionText([section("正文", "{: title='bad}")])).toThrow(/引号未闭合/);
  });
  it("bounds UTF-8 bytes and section count instead of silently cutting files", () => {
    expect(() => parseSectionText("中".repeat(350000))).toThrow(/1 MiB/);
    expect(() => parseSectionText("---\n{:}\n".repeat(10001))).toThrow(/10000/);
    expect(() => serializeSectionText(Array.from({ length: 10001 }, () => section("")))).toThrow(/10000/);
    const input = Array.from({ length: 2000 }, (_, index) => section(`区段${index}\n\n`, `{: order="${index}"}`));
    expect(parseSectionText(serializeSectionText(input)).map(file => file.text)).toEqual(input.map(file => file.text));
  });
});
describe("section IAL", () => {
  it("retains shortcuts, references, quoted whitespace/braces and escapes without expanding references", () => {
    const raw = '{: shared #anchor .left .right value="a \\"quote\\" and }" path=\'C:\\notes\' plain=ok}';
    const parsed = parseSectionAttributes(raw);
    expect(parsed.raw).toBe(raw);
    expect(parsed.values).toEqual({ id: "anchor", class: "left right", value: 'a "quote" and }', path: "C:\\notes", plain: "ok" });
    expect(parsed.tokens[0]).toMatchObject({ kind: "reference", name: "shared" });
    expect(parsed.tokens[4].raw).toBe('value="a \\"quote\\" and }"');
  });
  it("rejects ambiguous identities and malformed attributes without losing the input", () => {
    for (const text of ['{: #a id="b"}', '{: key="one" key="two"}', '{: title="x"more}', "{: name=}", "{: #}", "{: } trailing", "{: quote='open}"])
      expect(() => parseSectionAttributes(text, 9)).toThrow(/第 9 行/);
    expect(() => parseSectionAttributes('{: huge="' + "x".repeat(8192) + '"}')).toThrow(/8192/);
  });
  it("does not turn attribute keys into object prototypes", () => {
    const parsed = parseSectionAttributes('{: __proto__="raw" constructor="literal"}');
    expect(Object.getPrototypeOf(parsed.values)).toBe(null);
    expect(parsed.values.__proto__).toBe("raw");
    expect(parsed.values.constructor).toBe("literal");
  });
});

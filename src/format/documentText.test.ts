import { expect, it } from "vitest";
import { newId } from "../domain/concepts";
import { fileText, newFile, validateDocument } from "../domain/document";
import { newColumns, readLayout } from "../sections/layout";
import { importDocumentText, exportDocumentText } from "./documentText";
import { parseSectionAttributes } from "./sectionAttributes";
import { parseSectionText, serializeSectionText } from "./sectionText";
it("exports stable UUIDs and restores nested layouts, exact file text, and new complete CRDT sessions", () => {
  const a = newFile("text/x-kramdown", "牛顿第二定律 F=ma\n\u00a0\n\n"), b = newFile("text/plain", "可协作\n", "crdt"), c = newFile("text/x-kramdown", "````\n---\n{:}\n````");
  const inner = newColumns([a.id, b.id]), outer = newColumns([inner.id, c.id]);
  const body = validateDocument({ format: "kinship.document", version: 2, roots: [outer.id], blocks: [a, b, c, inner, outer] });
  const serialized = exportDocumentText(body), result = importDocumentText(serialized, "preserve");
  expect(result.body.roots).toEqual(body.roots);
  expect(result.body.blocks.map(block => block.id)).toEqual([outer.id, inner.id, a.id, b.id, c.id]);
  for (const expected of body.blocks) {
    const saved = result.body.blocks.find(block => block.id === expected.id)!;
    expect({ kind: saved.kind, mode: saved.mode, text: fileText(saved) }).toEqual({ kind: expected.kind, mode: expected.mode, text: fileText(expected) });
    expect(saved.version).toBe(1);
  }
  expect(result.collaborative).toBe(1); expect(result.fallback).toBe(0);
  // 文本导入重新初始化因果状态，文本相等不宣称恢复了原协作状态。
  const imported = result.body.blocks.find(block => block.id === b.id)!;
  if (imported.mode !== "crdt" || b.mode !== "crdt") throw Error("fixture");
  expect(imported.state).not.toBe(b.state);
  expect(exportDocumentText(result.body)).toBe(serialized);
});
it("copies all identities and rewrites only the layout adapter's declared references", () => {
  const a = newFile("text/x-kramdown", "文本内原有 UUID 保留"), b = newFile(), layout = newColumns([a.id, b.id]);
  if (a.mode !== "whole-file") throw Error("fixture");
  a.text += a.id;
  const body = validateDocument({ format: "kinship.document", version: 2, roots: [layout.id], blocks: [a, b, layout] });
  const copy = importDocumentText(exportDocumentText(body), "copy").body, copiedLayout = copy.blocks.find(block => block.kind === "layout")!;
  expect(copy.blocks.every(block => !body.blocks.some(original => original.id === block.id))).toBe(true);
  expect(copy.roots).toEqual([copiedLayout.id]);
  expect(readLayout(fileText(copiedLayout)).members).toEqual(copy.blocks.filter(block => block.kind === "file").map(block => block.id));
  expect(fileText(copy.blocks.find(block => block.kind === "file")!)).toBe(a.text);
  expect(importDocumentText(exportDocumentText(copy), "preserve").body.roots).toEqual(copy.roots);
});
it("keeps unknown or incomplete declarations as Kramdown, preserving all foreign attributes", () => {
  const id = newId(), raw = `{: file-id="${id}" file-id #anchor .foreign content-type="text/plain" edit-mode="crdt" title='未完整声明'}`;
  const source = serializeSectionText([{ text: "未知适配器原文\n\n", attributes: parseSectionAttributes(raw) }]);
  const imported = importDocumentText(source, "preserve"), file = imported.body.blocks[0];
  expect(file).toMatchObject({ id, mode: "whole-file", contentType: "text/x-kramdown", sourceIal: raw, text: "未知适配器原文\n\n" });
  expect(imported.fallback).toBe(1); expect(imported.collaborative).toBe(0);
  const exported = exportDocumentText(imported.body), attrs = parseSectionText(exported)[0].attributes!;
  expect(attrs.values).toMatchObject({ id: "anchor", "file-id": id, "content-type": "text/plain", "edit-mode": "crdt", title: "未完整声明" });
  expect(attrs.values["file-kind"]).toBeUndefined();
  expect(attrs.tokens.some(token => token.kind === "reference" && token.name === "file-id")).toBe(true);
  expect(importDocumentText(exported, "preserve")).toMatchObject({ fallback: 1, collaborative: 0 });
});
it("rejects duplicate/invalid file identities even when copying, and rejects broken layout topology", () => {
  const id = newId(), duplicate = `---\n{: file-id="${id}"}\n第一段\n---\n{: file-id="${id}"}\n第二段`;
  for (const mode of ["preserve", "copy"] as const) expect(() => importDocumentText(duplicate, mode)).toThrow(/第 5 行.*第 2 行重复/);
  expect(() => importDocumentText('---\n{: file-id="siyuan-id-is-not-a-uuid"}', "preserve")).toThrow(/UUID/);
  const layout = newColumns([newId()]);
  expect(() => importDocumentText(`---\n{: file-id="${layout.id}" file-kind="layout" edit-mode="whole-file" content-type="application/vnd.kinship.layout+json"}\n${layout.text}`, "copy")).toThrow(/区段不存在/);
});
it("assigns a new file identity to ordinary Markdown without treating its IAL as an envelope", () => {
  const original = "《西游记》笔记\n{: #heading}\n\n", parsed = importDocumentText(original, "preserve");
  expect(parsed.body.blocks).toHaveLength(1); expect(fileText(parsed.body.blocks[0])).toBe(original);
  expect(parsed.body.roots).toEqual([parsed.body.blocks[0].id]);
  expect(exportDocumentText(undefined)).toBe("");
  expect(importDocumentText("", "copy").body.blocks).toEqual([]);
});

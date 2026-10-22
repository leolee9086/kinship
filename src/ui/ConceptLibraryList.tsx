/** 列表窗口化：十万概念不创建十万个 DOM 按钮；搜索仍查询完整索引。 */
import { useEffect, useRef, useState } from "react";
import { C, type Concept } from "../domain/concepts";
import type { ConceptIndex } from "../domain/conceptIndex";
import { virtualWindow } from "./virtualWindow";
const ROW_HEIGHT = 58;
const OVERSCAN = 6;
export function ConceptLibraryList({ concepts, index, focus, onChoose, category }: {
  concepts: Concept[]; index: ConceptIndex; focus: string | null; onChoose: (id: string) => void; category: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState({ offset: 0, height: 500 });
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(() => setWindow(s => ({ ...s, height: el.clientHeight })));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => { viewport.current!.scrollTop = 0; setWindow(s => ({ ...s, offset: 0 })); }, [concepts]);
  const { start, end, before, after } = virtualWindow(concepts.length, window.offset, window.height, ROW_HEIGHT, OVERSCAN);
  return <div ref={viewport} className="library-results" onScroll={e => { const offset = e.currentTarget.scrollTop; setWindow(s => ({ ...s, offset })); }}>
    <p className="result-count">{concepts.length} 个{category}</p>
    <div style={{ height: before }} aria-hidden="true" />
    {concepts.slice(start, end).map(c => <button className={`concept-row ${c.id === focus ? "selected" : ""}`} key={c.id} onClick={() => onChoose(c.id)} title={c.label}>
      <span className={`concept-icon ${c.participants ? "relation-icon" : ""}`}>{c.participants ? "◇" : index.isA(c, C.person) ? "◉" : index.isA(c, C.place) ? "⌖" : index.isA(c, C.event) ? "◷" : "·"}</span>
      <span><strong>{c.label}</strong><small>{index.typeLabel(c)}</small></span><span className="row-arrow">↗</span>
    </button>)}
    <div style={{ height: after }} aria-hidden="true" />
    {!concepts.length && <p className="empty-state">没有匹配概念。可以创建一个新的概念。</p>}
  </div>;
}

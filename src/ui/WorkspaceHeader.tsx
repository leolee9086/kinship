/** 全局导航与当前图谱操作分层；次要命令收进更多菜单，项目入口保持可见。 */
import { useEffect, useRef, type ReactNode } from "react";
export function WorkspaceHeader({ projectControls, library, settingsOpen, pending, error, onLibrary, onSettings, onImport, onHelp }: {
  projectControls?: ReactNode; library: boolean; settingsOpen: boolean; pending: number; error: string | null;
  onLibrary: () => void; onSettings: () => void; onImport: () => void; onHelp: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const close = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  const run = (action: () => void) => { if (menu.current) menu.current.open = false; action(); };
  return <header className="app-header">
    <div className="workspace-identity"><div className="brand"><span className="brand-mark" aria-hidden="true">k</span><strong>Kinship</strong></div>{projectControls}</div>
    <nav className="header-actions" aria-label="工作区导航">
      <span className="save-status" role="status">{pending ? "正在保存…" : error ? "保存需检查" : "已保存"}</span>
      <button className={library ? "active" : ""} aria-pressed={library} onClick={onLibrary}>概念库</button>
      <button className={settingsOpen ? "active" : ""} aria-pressed={settingsOpen} onClick={onSettings}>展示</button>
      <details className="app-more" ref={menu} onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
        <summary aria-label="更多操作">•••</summary><div className="app-more-items" role="group" aria-label="更多工作区操作">
          <button disabled={pending > 0} onClick={() => run(onImport)}>导入图谱包</button>
          <button onClick={() => run(onHelp)}>键盘帮助</button>
        </div>
      </details>
    </nav>
  </header>;
}

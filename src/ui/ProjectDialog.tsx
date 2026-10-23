/** 明确区分项目切换、新建与重命名；错误不清空输入，未确认结果只能原样重试。 */
import { useState } from "react";
import type { Project, ProjectOperation } from "../contracts/projects";
import { newId } from "../domain/concepts";
import { useDialogFocus } from "./useDialogFocus";
export function ProjectDialog({ projects, current, busy, uncertain, error, onExecute, onClose }: {
  projects: Project[]; current: Project; busy: boolean; uncertain: boolean; error: string;
  onExecute: (operation?: ProjectOperation) => Promise<boolean>; onClose: () => void;
}) {
  const locked = busy || uncertain, dialog = useDialogFocus(() => { if (!locked) onClose(); });
  const [name, setName] = useState(""), [renamed, setRenamed] = useState(current.name);
  const switchTo = async (operation: ProjectOperation) => { if (await onExecute(operation)) onClose(); };
  return <div className="modal-scrim" onClick={() => { if (!locked) onClose(); }} onKeyDown={event => {
    event.stopPropagation(); if (event.key === "Escape" && !locked) onClose();
  }}><section ref={dialog} className="editor-dialog project-dialog" role="dialog" aria-modal="true" aria-label="项目管理" onClick={event => event.stopPropagation()}>
    <header><div><span className="eyebrow">KINSHIP</span><h2>项目</h2></div><button aria-label="关闭项目管理" disabled={locked} onClick={onClose}>×</button></header>
    <div className="project-dialog-body"><p className="muted">各项目的概念、视图和媒体独立保存。选择项目继续上次的工作。</p>
      <ul className="project-list" aria-label="项目列表">{projects.map(project => <li key={project.id}><button aria-current={project.id === current.id ? "true" : undefined} disabled={locked} onClick={() => void switchTo({ type: "project.select", id: project.id })}>
        <span><strong>{project.name}</strong><small>{project.id === current.id ? "当前项目" : "打开项目"}</small></span><span aria-hidden="true">{project.id === current.id ? "✓" : "↗"}</span>
      </button></li>)}</ul>
      <form onSubmit={event => { event.preventDefault(); void switchTo({ type: "project.create", id: newId(), name: name.trim() }); }}>
        <h3>新建项目</h3><label>项目名称<input autoComplete="off" required maxLength={100} disabled={locked} value={name} onChange={event => setName(event.target.value)} placeholder="例如：高中物理"/></label>
        <p className="muted">提供基础类型和角色，不包含演示关系。</p><button className="primary" disabled={locked || !name.trim()}>创建并打开</button>
      </form>
      <details><summary>重命名当前项目</summary><form onSubmit={event => { event.preventDefault(); void onExecute({ type: "project.rename", id: current.id, expectedVersion: current.version, name: renamed.trim() }); }}>
        <label>新的项目名称<input required maxLength={100} disabled={locked} value={renamed} onChange={event => setRenamed(event.target.value)}/></label><button disabled={locked || !renamed.trim() || renamed.trim() === current.name}>保存名称</button>
      </form></details>
      {error && <p className="form-error" role="alert">{error}</p>}{busy && <p role="status">正在打开项目…</p>}
      {uncertain && !busy && <button className="primary" onClick={() => void onExecute().then(done => { if (done) onClose(); })}>重试原操作</button>}
    </div>
  </section></div>;
}

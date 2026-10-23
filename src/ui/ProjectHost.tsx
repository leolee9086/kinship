/** 项目外壳只使用适配器能力；数据与命令队列在每次项目切换后重新挂载。 */
import { useRef, useState } from "react";
import type { ProjectAdapter } from "../adapter/projects";
import { App } from "./App";
import { useProjects } from "./useProjects";
import { ProjectDialog } from "./ProjectDialog";
export function ProjectHost({ adapter }: { adapter: ProjectAdapter }) {
  const projects = useProjects(adapter), [managing, setManaging] = useState(false), opener = useRef<HTMLButtonElement>(null);
  const current = projects.snapshot?.projects.find(project => project.id === projects.session?.id);
  if (!projects.session || !current) return <main className="loading-screen"><span className="brand-mark">k</span><h1>Kinship</h1>
    {projects.error ? <><p role="alert">{projects.error}</p><button disabled={projects.busy} onClick={projects.retryLoad}>重新打开</button></> : <p>正在打开项目…</p>}</main>;
  return <>
    <App key={current.id} adapter={projects.session.adapter} projectControls={locked => <button ref={opener} className="project-switch" aria-haspopup="dialog" aria-label={`项目：${current.name}`}
      disabled={locked || projects.busy} title={locked ? "当前操作完成后可切换项目" : "切换或新建项目"} onClick={() => setManaging(true)}><span>项目</span><strong>{current.name}</strong><span aria-hidden="true">⌄</span></button>} />
    {managing && <ProjectDialog projects={projects.snapshot!.projects} current={current} busy={projects.busy} uncertain={projects.uncertain} error={projects.error}
      onExecute={projects.execute} onClose={() => { setManaging(false); requestAnimationFrame(() => opener.current?.focus()); }} />}
  </>;
}

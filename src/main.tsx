import React from "react";
import { createRoot } from "react-dom/client";
import { ProjectHost } from "./ui/ProjectHost";
import { createLocalProjects } from "./composition/localProjects";

// 本地装配可整体替换成远端POST实现；UI不导入任何数据库实现。
const projects = createLocalProjects();
createRoot(document.getElementById("root")!).render(<React.StrictMode><ProjectHost adapter={projects.adapter} /></React.StrictMode>);

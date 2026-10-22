import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { createHttpAdapter } from "./adapter/api";
import { createInternalDispatch } from "./adapter/internalDispatch";
import { buildDataRouter } from "./backend/routes";
import { IndexedDbRepository } from "./backend/indexeddb";

// 唯一装配点：React → DataAdapter → internal fetch → 路由 → repository。
// UI 与领域代码都不导入具体存储实现；二进制媒体也没有额外的旁路。
const repository = new IndexedDbRepository();
const adapter = createHttpAdapter(createInternalDispatch(buildDataRouter(repository)));
createRoot(document.getElementById("root")!).render(<React.StrictMode><App adapter={adapter} /></React.StrictMode>);

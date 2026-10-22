import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { createHttpAdapter } from "./adapter/http";
import { buildDataRouter, createInternalDispatch } from "./adapter/router";
import seedData from "./data/seed.json";
import "@xyflow/react/dist/style.css";
import "./ui/app.css";

// 装配：路由 → internalFetch → 适配器 → React。
// 换成真后端时，只替换 createInternalDispatch 这一行。
const dataRouter = buildDataRouter();
const dispatch = createInternalDispatch(dataRouter);
const adapter = createHttpAdapter(dispatch);

// 首次启动时把示例家谱灌进 IndexedDB；已有数据就跳过。
async function bootstrap() {
  const snap = await adapter.load();
  if (snap.persons.length === 0) {
    await adapter.seed(seedData as never);
  }
}

bootstrap().then(() => {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App adapter={adapter} />
    </React.StrictMode>
  );
});

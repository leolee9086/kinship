import { defineConfig } from "vitest/config";

export default defineConfig({
  // 上游源码克隆在 .tmp；它的 Jest/Puppeteer 套件不属于 Kinship 的 Vitest 验收。
  test: { include: ["src/**/*.test.ts"] },
});

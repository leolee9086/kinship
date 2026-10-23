/** 从锁定的依赖产物复制浏览器按需资源；开发和Pages共用路径，不依赖运行时CDN。 */
import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const source = dirname(require.resolve("vditor/package.json"));
const target = resolve(root, "public/vditor/dist");
await mkdir(target, { recursive: true });
for (const directory of ["css", "images", "js"]) await cp(resolve(source, "dist", directory), resolve(target, directory), { recursive: true });
await cp(resolve(source, "LICENSE"), resolve(root, "public/vditor/LICENSE"));
console.log("Prepared self-hosted Vditor assets from the locked package");

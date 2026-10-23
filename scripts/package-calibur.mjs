/** 将指定S-Forge检出的CaliburRouter源码与构建产物封装成可在Pages复现的精确依赖，不改源仓库。 */
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? resolve(root, "../s-forge/packages/caliburRouter"));
const metadata = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
if (metadata.name !== "calibur-router" || metadata.version !== "0.1.0") throw new Error("必须明确审阅包名与版本后才能更新依赖");
await mkdir(resolve(root, ".tmp"), { recursive: true });
const staging = await mkdtemp(resolve(root, ".tmp/calibur-pack-"));
const target = resolve(staging, "package"); await mkdir(target);
for (const part of ["dist", "src"]) await cp(resolve(source, part), resolve(target, part), { recursive: true });
await copyFile(resolve(source, "README.md"), resolve(target, "README.md"));
const { scripts: _scripts, devDependencies: _development, ...runtime } = metadata;
await writeFile(resolve(target, "package.json"), JSON.stringify(runtime, null, 2) + "\n", "utf8");
await mkdir(resolve(root, "vendor"), { recursive: true });
const archive = resolve(root, `vendor/calibur-router-${metadata.version}.tgz`);
const result = spawnSync("tar", ["-czf", archive, "-C", staging, "package"], { stdio: "inherit" });
if (result.error) throw result.error; if (result.status !== 0) throw new Error(`tar退出码：${result.status}`);
const bytes = await readFile(archive);
const digest = createHash("sha256").update(bytes).digest("hex");
const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
// 同名tar重打包时，本地pnpm缓存可能沿用旧摘要；把锁文件所需的完整性值也明确输出。
console.log(JSON.stringify({ source, archive, sha256: digest, integrity }));

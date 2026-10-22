/** 后端无关的契约目录；输出为标准 JSON，包含共享递归定义和接口输入/结果/错误模式。 */
import { registry } from "./rpc";
import { FailureSchema } from "./errors";
import { JsonSchema } from "./primitives";
export function contractCatalog() {
  // JSON 往返移除 TypeBox 类型符号；Rust/SQL 适配器不需要安装 TypeBox 才能读取该目录。
  return JSON.parse(JSON.stringify({ protocol: "kinship.rpc", version: 1,
    schemaDialect: "http://json-schema.org/draft-07/schema#", definitions: [JsonSchema], failure: FailureSchema,
    methods: Object.fromEntries(Object.entries(registry).map(([name, contract]) => [name, { ...contract, method: "POST" }])) })) as {
      protocol: string; version: number; schemaDialect: string; definitions: object[]; failure: object;
      methods: Record<string, { path: string; method: string; kind: string; role: string; request: object; result: object }>;
    };
}

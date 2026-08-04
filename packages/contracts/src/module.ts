/**
 * 模块契约(PRD §11 / AGENTS §6)。
 * 模块必须拆分为 manifest / shared / server / web / agent / offline / migrations 多入口,
 * 不得使用跨运行时的巨型 ModuleManifest。
 */
import type { SemanticIconKey } from "./theme.js";
import type { ResourceDescriptor, AgentOperationName } from "./resource.js";
import type { HostContext, RouteRegistrar } from "./host.js";
import type { DataMirrorExporter } from "./mirror.js";

/** 模块能力名称 */
export type ModuleCapabilityName =
  | "server"
  | "web"
  | "agent"
  | "offline"
  | "data-mirror"
  | "migrations";

/** 运行时无关的模块元数据(manifest.ts 不得 import React/Fastify/数据库) */
export interface ModuleMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities: readonly ModuleCapabilityName[];
}

/** 模块导航项(AGENTS §6 / §16.1):只声明语义 iconKey */
export interface NavigationItem {
  id: string;
  label: string;
  iconKey: SemanticIconKey;
  route: string;
  order?: number;
}

/** Web 路由定义;element 是 React 组件,由 web-host 类型化使用(contracts 保持运行时无关) */
export interface WebRouteDefinition {
  path: string;
  element: unknown;
}

/** 模块服务端入口(PRD §11.6 / AGENTS §6) */
export interface ServerModule {
  metadata: ModuleMetadata;
  /** 注册路由、资源、搜索 provider、迁移、capture 等 */
  register(context: ServerModuleContext): void | Promise<void>;
  /** 可选数据镜像 exporter(只存在于服务端入口) */
  dataMirrorExporter?: DataMirrorExporter;
}

export interface ServerModuleContext {
  host: HostContext;
  routes: RouteRegistrar;
}

/** 模块 Web 入口 */
export interface WebModule {
  metadata: ModuleMetadata;
  navigation: readonly NavigationItem[];
  routes: readonly WebRouteDefinition[];
  /** 首页 widget(可选) */
  homeWidget?: unknown;
}

/** Agent 资源描述 */
export interface AgentResourceDescriptor {
  type: string;
  label: string;
  operations: readonly AgentOperationName[];
}

/** Agent 操作上下文 */
export interface AgentOperationContext {
  profileId: string;
  resourceType: string;
  operation: AgentOperationName;
  /** 参数:get/update/delete 为 id;create/search/list 为对应输入 */
  args: Record<string, unknown>;
  host: HostContext;
}

/** 模块 Agent 入口 */
export interface AgentModule {
  metadata: ModuleMetadata;
  resources: readonly AgentResourceDescriptor[];
  handlers: Readonly<Record<string, AgentOperationHandler>>;
}

export type AgentOperationHandler = (
  ctx: AgentOperationContext
) => Promise<unknown>;

/** 离线操作声明(AGENTS §14:在线优先,仅白名单操作离线可写) */
export interface OfflineOperationDeclaration {
  /** 操作标识,如 "notes.create" */
  operation: string;
  conflictStrategy: "server-wins" | "client-wins" | "manual";
}

/** 模块离线入口 */
export interface OfflineModule {
  metadata: ModuleMetadata;
  offlineOperations: readonly OfflineOperationDeclaration[];
}

/** 模块迁移文件格式(顺序迁移) */
export interface ModuleMigration {
  id: string;
  up: (sql: (statement: string) => void) => void;
}

/** 模块聚合入口:应用构建期生成 registry 时组装(应用不直接依赖巨形 manifest) */
export interface ModuleAssembly {
  metadata: ModuleMetadata;
  server?: ServerModule;
  web?: WebModule;
  agent?: AgentModule;
  offline?: OfflineModule;
  resources: readonly ResourceDescriptor[];
}

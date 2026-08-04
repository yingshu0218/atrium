/**
 * @atrium/notes 聚合入口 — 只导出运行时无关的 manifest 与 shared。
 * server / web / agent / offline / migrations 由应用按运行时从子入口
 * (`@atrium/notes/server` 等)组合,避免把 React / Fastify 代码带入无关运行时。
 */
export { notesManifest } from "./manifest.js";
export * from "./shared/index.js";

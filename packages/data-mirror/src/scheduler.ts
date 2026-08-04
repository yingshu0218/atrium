/**
 * 数据镜像调度器(PRD §20.6 / AGENTS §19.5)。
 * 支持 daily / weekly 定时触发;关闭所有客户端后服务端仍按计划运行。
 */
import type { MirrorConfig } from "./config.js";

export interface SchedulerOptions {
  getConfig(): Promise<MirrorConfig | null>;
  /** 执行一次镜像(engine.runOnce) */
  run(): Promise<unknown>;
  /** 可选时钟(测试注入),默认 Date */
  now?(): Date;
  logger?: { warn(message: string, meta?: unknown): void };
}

const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;

export class MirrorScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly getConfig: SchedulerOptions["getConfig"];
  private readonly run: SchedulerOptions["run"];
  private readonly now: () => Date;
  private readonly warn: (message: string, meta?: unknown) => void;

  constructor(options: SchedulerOptions) {
    this.getConfig = options.getConfig;
    this.run = options.run;
    this.now = options.now ?? (() => new Date());
    this.warn = options.logger?.warn ?? ((message) => console.warn(message));
  }

  /** 按当前配置启动定时器;配置变更后需调用 restart。 */
  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000); // 每分钟检查一次是否到点
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 手动触发一次检查(测试与外部调用)。 */
  async tick(): Promise<void> {
    const config = await this.getConfig();
    if (config === null || !config.enabled || config.schedule === "manual") {
      return;
    }
    const intervalMs = config.schedule === "daily" ? DAILY_MS : WEEKLY_MS;
    const lastSuccessAt = config.lastSuccessAt;
    if (lastSuccessAt === undefined) {
      await this.run();
      return;
    }
    const elapsed = this.now().getTime() - Date.parse(lastSuccessAt);
    if (elapsed >= intervalMs) {
      await this.run();
    }
  }
}

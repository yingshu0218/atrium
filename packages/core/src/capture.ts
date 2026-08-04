/**
 * capture 快速输入(PRD §12.2):按注册顺序尝试各 CaptureHandler,
 * 第一个成功即返回;全部失败抛 CoreError。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type {
  CaptureHandler,
  CaptureService,
  HostContext,
} from "@atrium/contracts";
import { CoreError } from "./errors.js";

export interface CaptureServiceDeps {
  /** 按 profile 创建受限访问上下文(handler 需要绑定请求 profile 的 host) */
  hostFor(profileId: string, opts?: { adminVerified?: boolean }): HostContext;
}

export class CaptureServiceImpl implements CaptureService {
  private readonly handlers: CaptureHandler[] = [];

  constructor(private readonly deps: CaptureServiceDeps) {}

  register(handler: CaptureHandler): void {
    this.handlers.push(handler);
  }

  async capture(
    profileId: string,
    input: { text: string; meta?: Readonly<Record<string, unknown>> },
  ): Promise<{ resourceType: string; resourceId: string; shortId: string }> {
    for (const handler of this.handlers) {
      try {
        const host = this.deps.hostFor(profileId);
        const result = await handler.capture(profileId, input, host);
        return { resourceType: handler.resourceType, ...result };
      } catch {
        // 尝试下一个 handler。
      }
    }
    throw new CoreError(
      ERROR_CODES.INTERNAL,
      "no capture handler could handle the input",
    );
  }
}

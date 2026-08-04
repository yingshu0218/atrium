/**
 * 数据镜像配置存储(PRD §20.5 / AGENTS §19.4)。
 * 非敏感设置与 secret 一并存于服务端(当前使用 core 的 config 表,
 * secret backend 属 PRD 开放项,后续可由 ADR 替换为专用 secret 存储)。
 * secret 永不进入 public 投影、日志或客户端响应。
 */
import type { ConfigService } from "@atrium/contracts";
import type { MirrorConfigPublic } from "@atrium/contracts";

export interface MirrorConfig {
  enabled: boolean;
  repoUrl: string;
  branch: string;
  /** 远程仓库内的数据目录前缀(缺省 atrium-data)。 */
  dataDirPrefix?: string;
  authType: "ssh-deploy-key" | "pat" | "none";
  /** secret:SSH 私钥,不回显 */
  sshPrivateKey?: string;
  /** secret:Personal Access Token,不回显 */
  pat?: string;
  schedule: "daily" | "weekly" | "manual";
  includeAttachments: boolean;
  /** 最后一次成功推送时间(调度器据此计算周期) */
  lastSuccessAt?: string;
  /** 最后一次失败原因(脱敏后) */
  lastError?: string;
}

/** 默认分支名。 */
export const DEFAULT_BRANCH = "main";

export function defaultMirrorConfig(): MirrorConfig {
  return {
    enabled: false,
    repoUrl: "",
    branch: DEFAULT_BRANCH,
    authType: "none",
    schedule: "manual",
    includeAttachments: false,
  };
}

/** 脱敏仓库地址:隐藏 URL 中的用户名与口令。 */
export function redactRepoUrl(url: string): string {
  return url.replace(/\/\/[^/@\s]+@/, "//***@");
}

/** 构建对外投影(AGENTS §13:只显示脱敏仓库信息、认证类型与指纹)。 */
export function toPublicConfig(config: MirrorConfig): MirrorConfigPublic {
  return {
    enabled: config.enabled,
    repoUrlRedacted: config.repoUrl ? redactRepoUrl(config.repoUrl) : "",
    branch: config.branch,
    ...(config.dataDirPrefix !== undefined
      ? { dataDirPrefix: config.dataDirPrefix }
      : {}),
    authType: config.authType,
    schedule: config.schedule,
    includeAttachments: config.includeAttachments,
  };
}

export class MirrorConfigStore {
  private readonly key = "data-mirror:config";

  constructor(private readonly config: ConfigService) {}

  async get(): Promise<MirrorConfig | null> {
    return this.getSync();
  }

  /** 同步读取(core 的 ConfigService.get 为同步;供脱敏等场景使用)。 */
  getSync(): MirrorConfig | null {
    const stored = this.config.get<MirrorConfig>(this.key);
    return stored ?? null;
  }

  async set(value: MirrorConfig): Promise<void> {
    await this.config.set(this.key, value);
  }
}

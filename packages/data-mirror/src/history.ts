/**
 * 数据镜像执行历史(AGENTS §19.5 / PRD §20.10)。
 * 基于 core 的 ConfigService 存储(JSON 数组,截断上限)。
 */
import type { ConfigService } from "@atrium/contracts";
import type { MirrorRunRecord } from "@atrium/contracts";

const HISTORY_KEY = "data-mirror:runs";
const DEFAULT_MAX_ENTRIES = 100;

export class MirrorHistory {
  private readonly maxEntries: number;

  constructor(
    private readonly config: ConfigService,
    maxEntries = DEFAULT_MAX_ENTRIES,
  ) {
    this.maxEntries = maxEntries;
  }

  async append(record: MirrorRunRecord): Promise<void> {
    const entries = this.list();
    entries.unshift(record);
    await this.config.set(HISTORY_KEY, entries.slice(0, this.maxEntries));
  }

  list(limit?: number): MirrorRunRecord[] {
    const entries = this.config.get<MirrorRunRecord[]>(HISTORY_KEY) ?? [];
    return typeof limit === "number" ? entries.slice(0, limit) : entries;
  }
}

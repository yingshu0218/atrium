/**
 * 搜索聚合(PRD §12.2):模块注册 SearchProvider,SearchService 按注册顺序
 * 聚合各 provider 的结果;provider 返回顺序即相关度顺序,最终截断 limit。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type { SearchHit, SearchProvider, SearchService } from "@atrium/contracts";
import { CoreError } from "./errors.js";

export class SearchServiceImpl implements SearchService {
  private readonly providers = new Map<string, SearchProvider>();

  register(provider: SearchProvider): void {
    if (this.providers.has(provider.resourceType)) {
      throw new CoreError(
        ERROR_CODES.CONFLICT,
        `search provider for resource type "${provider.resourceType}" is already registered`,
      );
    }
    this.providers.set(provider.resourceType, provider);
  }

  async search(
    profileId: string,
    query: string,
    limit = 10,
  ): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    for (const provider of this.providers.values()) {
      const result = await provider.search(profileId, query, limit);
      hits.push(...result);
    }
    return hits.slice(0, limit);
  }
}

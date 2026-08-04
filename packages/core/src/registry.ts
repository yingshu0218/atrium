/**
 * 资源注册表(AGENTS.md §10)。
 * 跨模块关系统一通过 resource registry / relations / entity_tags / attachments;
 * 注册时资源类型重复抛 CONFLICT。
 */
import { ERROR_CODES } from "@atrium/contracts";
import type { ResourceDescriptor, ResourceRegistry } from "@atrium/contracts";
import { CoreError } from "./errors.js";

export class ResourceRegistryImpl implements ResourceRegistry {
  private readonly entries = new Map<string, ResourceDescriptor>();

  register(descriptor: ResourceDescriptor): void {
    if (this.entries.has(descriptor.type)) {
      throw new CoreError(
        ERROR_CODES.CONFLICT,
        `resource type "${descriptor.type}" is already registered`,
      );
    }
    this.entries.set(descriptor.type, descriptor);
  }

  get(type: string): ResourceDescriptor | undefined {
    return this.entries.get(type);
  }

  all(): ResourceDescriptor[] {
    return [...this.entries.values()];
  }
}

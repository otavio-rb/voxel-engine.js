import { blockRegistry } from '../core/BlockRegistry';
import { BlockDefinition } from '../types';

const blockTypes: Record<number, BlockDefinition> = {};

export function syncBlockTypes(): void {
  for (const block of blockRegistry.getAll()) {
    blockTypes[block.id] = { label: block.name, color: block.color };
  }
}

syncBlockTypes();

export default blockTypes;

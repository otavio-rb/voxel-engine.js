import { BlockDefinition, BlockType } from '../types';

const blockTypes: Record<BlockType, BlockDefinition> = {
  [BlockType.Stone]: { label: 'stone', color: 0x888888 },
  [BlockType.Dirt]:  { label: 'dirt',  color: 0x8B4513 },
  [BlockType.Grass]: { label: 'grass', color: 0x4CAF50 },
  [BlockType.Sand]:  { label: 'sand',  color: 0xF4D03F },
  [BlockType.Snow]:  { label: 'Snow',  color: 0xffffff },
  [BlockType.Empty]: { label: 'empty', color: 0x000000 },
  [BlockType.Water]: { label: 'Water', color: 0x4444ff },
  [BlockType.Coal]:  { label: 'Coal',  color: 0x222222 },
  [BlockType.Iron]:  { label: 'Iron',  color: 0xcccccc },
  [BlockType.Wood]:  { label: 'Wood',  color: 0x5D4037 },
  [BlockType.Leaves]: { label: 'Leaves', color: 0x2E7D32 },
};

export default blockTypes;

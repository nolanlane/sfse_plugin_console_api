import type { PlayerStatSnapshot } from '../types';

export const initialPlayerStats: PlayerStatSnapshot[] = [
  { id: 'health', label: 'Health', group: 'Vitals', command: 'player.getav health', value: 'Unknown', raw: '' },
  { id: 'oxygen', label: 'O₂', group: 'Vitals', command: 'player.getav oxygen', value: 'Unknown', raw: '' },
  { id: 'carryweight', label: 'Carry', group: 'Inventory', command: 'player.getav carryweight', value: 'Unknown', raw: '' },
  { id: 'credits', label: 'Credits', group: 'Inventory', command: 'player.getitemcount 0000000F', value: 'Unknown', raw: '' },
  { id: 'xp', label: 'XP', group: 'Progression', command: 'player.getav experience', value: 'Unknown', raw: '' },
  { id: 'level', label: 'Level', group: 'Progression', command: 'player.getlevel', value: 'Unknown', raw: '' },
  { id: 'mass', label: 'Mass', group: 'Inventory', command: 'player.getav mass', value: 'Unknown', raw: '' },
  { id: 'boostpack', label: 'Boost', group: 'Vitals', command: 'player.getav boostpack', value: 'Unknown', raw: '' },
  { id: 'environmental', label: 'Env Resist', group: 'Suit', command: 'player.getav environmentalresistance', value: 'Unknown', raw: '' },
  { id: 'thermal', label: 'Thermal', group: 'Suit', command: 'player.getav thermalresistance', value: 'Unknown', raw: '' }
];

export function parseStatValue(raw: string): string {
  const numberMatch = raw.match(/-?\d+(?:\.\d+)?/);
  return numberMatch?.[0] ?? raw.trim() ?? 'Observed; parse unavailable';
}

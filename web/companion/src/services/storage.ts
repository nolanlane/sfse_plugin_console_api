import { defaultConnectionSettings } from '../config/defaults';
import type { ConnectionSettings, FavoriteCommand, InventoryLedgerEntry, Macro, PlayerStatSnapshot, CommandHistoryEntry } from '../types';

const keys = {
  connection: 'sf-companion.connection',
  favorites: 'sf-companion.favorites',
  macros: 'sf-companion.macros',
  ledger: 'sf-companion.ledger',
  stats: 'sf-companion.stats',
  history: 'sf-companion.history'
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  loadConnection: () => readJson(keys.connection, defaultConnectionSettings),
  saveConnection: (value: ConnectionSettings) => writeJson(keys.connection, value),
  loadFavorites: () => readJson<FavoriteCommand[]>(keys.favorites, []),
  saveFavorites: (value: FavoriteCommand[]) => writeJson(keys.favorites, value),
  loadMacros: () => readJson<Macro[]>(keys.macros, []),
  saveMacros: (value: Macro[]) => writeJson(keys.macros, value),
  loadLedger: () => readJson<InventoryLedgerEntry[]>(keys.ledger, []),
  saveLedger: (value: InventoryLedgerEntry[]) => writeJson(keys.ledger, value),
  loadStats: () => readJson<PlayerStatSnapshot[]>(keys.stats, []),
  saveStats: (value: PlayerStatSnapshot[]) => writeJson(keys.stats, value),
  loadHistory: () => readJson<CommandHistoryEntry[]>(keys.history, []),
  saveHistory: (value: CommandHistoryEntry[]) => writeJson(keys.history, value),
  exportBackup: () => JSON.stringify(Object.fromEntries(Object.values(keys).map((key) => [key, readJson(key, null)])), null, 2),
  importBackup: (json: string) => {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    Object.values(keys).forEach((key) => {
      if (key in parsed) writeJson(key, parsed[key]);
    });
  },
  resetAll: () => Object.values(keys).forEach((key) => localStorage.removeItem(key))
};

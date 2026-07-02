import type { InventoryLedgerEntry } from '../types';

const itemPattern = /player\.(additem|removeitem)\s+([a-z0-9]+)\s+(-?\d+)/i;

export function ledgerEntryFromCommand(command: string): InventoryLedgerEntry | null {
  const match = command.match(itemPattern);
  if (!match) return null;
  const [, action, itemId, quantity] = match;
  const delta = Number(quantity) * (action.toLowerCase() === 'removeitem' ? -1 : 1);
  return {
    id: crypto.randomUUID(),
    itemId,
    displayName: itemId,
    quantityDelta: delta,
    sourceCommand: command,
    notes: 'Estimated from app-issued console command; not an authoritative inventory snapshot.',
    timestamp: new Date().toISOString()
  };
}

import type { SafetyClass } from '../types';

const blockedPatterns = [/\b(caqs|killall|resetquest|disable|markfordelete)\b/i];
const dangerousPatterns = [/\b(setstage|completequest|movetoqt|setessential|removeallitems)\b/i];
const confirmationPatterns = [/\b(player\.additem|player\.removeitem|player\.setav|player\.modav|player\.addperk|player\.removeperk|coc\s+)\b/i];

export function classifyCommand(command: string): SafetyClass {
  if (blockedPatterns.some((pattern) => pattern.test(command))) return 'blocked';
  if (dangerousPatterns.some((pattern) => pattern.test(command))) return 'dangerous';
  if (confirmationPatterns.some((pattern) => pattern.test(command))) return 'confirmation';
  return 'safe';
}

export function canRunSafety(safetyClass: SafetyClass, advancedMode: boolean): boolean {
  if (safetyClass === 'blocked') return advancedMode;
  if (safetyClass === 'dangerous') return advancedMode;
  return true;
}

export function needsConfirmation(safetyClass: SafetyClass): boolean {
  return safetyClass === 'confirmation' || safetyClass === 'dangerous' || safetyClass === 'blocked';
}

export type ConsoleMode = 'command' | 'stream';
export type SafetyClass = 'safe' | 'confirmation' | 'dangerous' | 'blocked';
export type TelemetryConfidence = 'verified' | 'best-effort' | 'fallback' | 'unknown' | 'unsupported';
export type TelemetrySource = 'snapshot-cache' | 'hook' | 'console-fallback' | 'static-config' | 'unknown';

export interface TelemetryEnvelope {
  schemaVersion: number;
  generatedAt: string;
  source: TelemetrySource;
  available: boolean;
  confidence: TelemetryConfidence;
  stale: boolean;
  ttlMs: number;
  warnings: string[];
}

export interface TelemetryFeatureFlags {
  rawConsole: boolean | null;
  rawStream: boolean | null;
  structuredStatus: boolean | null;
  structuredPlayer: boolean | null;
  structuredLocation: boolean | null;
  structuredSnapshot: boolean | null;
  typedEvents: boolean | null;
  inventory: boolean | null;
  ship: boolean | null;
  quests: boolean | null;
}

export interface TelemetryPluginInfo {
  name: string | null;
  version: string | null;
  sfseLoaded: boolean | null;
  gameRuntime: string | null;
}

export interface TelemetryServerInfo {
  enabled: boolean | null;
  host: string | null;
  port: number | null;
  corsDisabled: boolean | null;
  staticFilesDisabled: boolean | null;
}

export interface TelemetrySnapshotInfo {
  cacheInitialized: boolean | null;
  lastUpdateAt: string | null;
  updateCount: number | null;
}

export interface TelemetryStatusData {
  plugin: TelemetryPluginInfo;
  server: TelemetryServerInfo;
  features: TelemetryFeatureFlags;
  snapshot: TelemetrySnapshotInfo;
}

export interface TelemetryStatBlock {
  current: number | null;
  maximum: number | null;
  percent: number | null;
  units?: string | null;
}

export interface TelemetryPlayerFlags {
  inCombat: boolean | null;
  weaponDrawn: boolean | null;
  inMenu: boolean | null;
  inDialogue: boolean | null;
  inShip: boolean | null;
}

export interface TelemetryPlayerData {
  formId: string | null;
  name: string | null;
  level: number | null;
  xp: number | null;
  health: TelemetryStatBlock;
  oxygen: TelemetryStatBlock;
  carryWeight: TelemetryStatBlock;
  credits: number | null;
  flags: TelemetryPlayerFlags;
}

export interface TelemetryCoordinate3D {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface TelemetryLocationNameRef {
  formId: string | null;
  editorId: string | null;
  name: string | null;
}

export interface TelemetryLocationData {
  cell: TelemetryLocationNameRef;
  worldspace: TelemetryLocationNameRef;
  planet: {
    formId: string | null;
    name: string | null;
    system: string | null;
  };
  position: TelemetryCoordinate3D;
  rotation: TelemetryCoordinate3D;
  interior: boolean | null;
  loaded: boolean | null;
}

export interface TelemetryStatusResponse extends TelemetryEnvelope {
  data: TelemetryStatusData;
}

export interface TelemetryPlayerResponse extends TelemetryEnvelope {
  data: TelemetryPlayerData;
}

export interface TelemetryLocationResponse extends TelemetryEnvelope {
  data: TelemetryLocationData;
}

export interface TelemetrySummaryResponse {
  available: boolean | null;
  confidence: TelemetryConfidence | null;
  itemCount: number | null;
  totalMass: number | null;
}

export interface TelemetryShipSummaryResponse {
  available: boolean | null;
  confidence: TelemetryConfidence | null;
  name: string | null;
  cargoUsed: number | null;
  cargoCapacity: number | null;
}

export interface TelemetryQuestSummaryResponse {
  available: boolean | null;
  confidence: TelemetryConfidence | null;
  activeQuestCount: number | null;
  trackedQuestId: string | null;
}

export interface TelemetrySnapshotData {
  status: TelemetryStatusResponse;
  player: TelemetryPlayerResponse;
  location: TelemetryLocationResponse;
  inventorySummary: TelemetrySummaryResponse;
  shipSummary: TelemetryShipSummaryResponse;
  questSummary: TelemetryQuestSummaryResponse;
}

export interface TelemetrySnapshotResponse extends TelemetryEnvelope {
  data: TelemetrySnapshotData;
}

export interface ConnectionSettings {
  baseUrl: string;
  defaultTimeoutMs: number;
  advancedMode: boolean;
  endpointMode?: 'default' | 'external';
  endpointLabel?: string;
  transportMode?: 'direct' | 'proxy';
  proxyBaseUrl?: string;
}

export type ServerHealthStatus = 'unchecked' | 'checking' | 'online' | 'offline';

export interface ServerHealth {
  status: ServerHealthStatus;
  checkedAt?: string;
  latencyMs?: number;
  message: string;
}

export interface CommandDefinition {
  id: string;
  title: string;
  commandTemplate: string;
  category: string;
  description: string;
  tags: string[];
  safetyClass: SafetyClass;
  defaultMode: ConsoleMode;
  parameters?: Array<{
    name: string;
    label: string;
    type: 'text' | 'number' | 'select';
    required: boolean;
    options?: string[];
    defaultValue?: string;
  }>;
}

export interface FavoriteCommand {
  id: string;
  name: string;
  command: string;
  mode: ConsoleMode;
  safetyClass: SafetyClass;
}

export interface MacroStep {
  id: string;
  command: string;
  mode: ConsoleMode;
  delayMs: number;
}

export interface Macro {
  id: string;
  name: string;
  stopOnError: boolean;
  steps: MacroStep[];
}

export interface StreamLogLine {
  id: string;
  text: string;
  timestamp: string;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  mode: ConsoleMode;
  safetyClass: SafetyClass;
  source: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  response?: string;
  error?: string;
  timestamp: string;
}

export interface InventoryLedgerEntry {
  id: string;
  itemId: string;
  displayName: string;
  quantityDelta: number;
  sourceCommand: string;
  notes: string;
  timestamp: string;
}

export interface PlayerStatSnapshot {
  id: string;
  label: string;
  group?: string;
  command: string;
  value: string;
  raw: string;
  observedAt?: string;
}

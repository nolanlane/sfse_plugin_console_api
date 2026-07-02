import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import catalogData from '../data/commandCatalog.json';
import { defaultConnectionSettings } from '../config/defaults';
import { appendBounded, StreamClient, type StreamStatus } from '../services/streamClient';
import { storage } from '../services/storage';
import { classifyCommand, canRunSafety, needsConfirmation } from '../services/safetyRules';
import { CommandQueue } from '../services/commandQueue';
import { ledgerEntryFromCommand } from '../services/inventoryLedger';
import { initialPlayerStats, parseStatValue } from '../services/playerStats';
import { ConsoleApi, getConsoleEndpoint, getStreamEndpoint } from '../services/consoleApi';
import { TelemetryApi } from '../services/telemetryApi';
import type { CommandDefinition, CommandHistoryEntry, ConnectionSettings, ConsoleMode, FavoriteCommand, InventoryLedgerEntry, Macro, PlayerStatSnapshot, SafetyClass, ServerHealth, StreamLogLine, TelemetryConfidence, TelemetryFeatureFlags, TelemetrySnapshotResponse } from '../types';

type Screen = 'dashboard' | 'console' | 'catalog' | 'favorites' | 'inventory' | 'settings';

const catalog = catalogData as CommandDefinition[];
const quickCheats = catalog.filter((item) => ['god-mode', 'noclip', 'detect-ai', 'add-credits', 'add-digipicks', 'show-inventory', 'quest-targets'].includes(item.id));

function materialize(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function safetyLabel(safetyClass: SafetyClass): string {
  return safetyClass === 'safe' ? 'Safe' : safetyClass === 'confirmation' ? 'Confirm' : safetyClass === 'dangerous' ? 'Advanced' : 'Blocked';
}

function telemetryLabel(value?: string | null): string {
  return value && value.trim() ? value : 'Unknown';
}

function telemetryConfidenceLabel(value?: TelemetryConfidence | null): string {
  return value ?? 'unknown';
}

function telemetryTimestampLabel(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function telemetryBooleanLabel(value?: boolean | null): string {
  if (value === null || value === undefined) return 'Unknown';
  return value ? 'Yes' : 'No';
}

function telemetryFeatureEntries(features?: TelemetryFeatureFlags | null): Array<[string, boolean | null]> {
  return Object.entries(features ?? {}) as Array<[string, boolean | null]>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [connection, setConnection] = useState<ConnectionSettings>(() => storage.loadConnection());
  const [logs, setLogs] = useState<StreamLogLine[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('disconnected');
  const [paused, setPaused] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [history, setHistory] = useState<CommandHistoryEntry[]>(() => storage.loadHistory());
  const [favorites, setFavorites] = useState<FavoriteCommand[]>(() => storage.loadFavorites());
  const [macros, setMacros] = useState<Macro[]>(() => storage.loadMacros());
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>(() => storage.loadLedger());
  const [stats, setStats] = useState<PlayerStatSnapshot[]>(() => storage.loadStats().length ? storage.loadStats() : initialPlayerStats);
  const [freeCommand, setFreeCommand] = useState('player.getav health');
  const [freeMode, setFreeMode] = useState<ConsoleMode>('command');
  const [lastOutput, setLastOutput] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('');
  const [macroDraft, setMacroDraft] = useState('player.getav health\nplayer.getav carryweight');
  const [favoriteName, setFavoriteName] = useState('');
  const [health, setHealth] = useState<ServerHealth>({ status: 'unchecked', message: 'Server not checked yet. Run a probe before commanding from mobile.' });
  const [telemetrySnapshot, setTelemetrySnapshot] = useState<TelemetrySnapshotResponse | null>(null);
  const [telemetryState, setTelemetryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [telemetryMessage, setTelemetryMessage] = useState('Native telemetry is not loaded yet.');
  const [telemetryCheckedAt, setTelemetryCheckedAt] = useState<string | null>(null);
  const streamRef = useRef<StreamClient | null>(null);

  useEffect(() => storage.saveConnection(connection), [connection]);
  useEffect(() => storage.saveFavorites(favorites), [favorites]);
  useEffect(() => storage.saveMacros(macros), [macros]);
  useEffect(() => storage.saveLedger(ledger), [ledger]);
  useEffect(() => storage.saveStats(stats), [stats]);
  useEffect(() => storage.saveHistory(history.slice(0, 100)), [history]);

  const queue = useMemo(() => new CommandQueue(() => connection, (entry) => {
    setHistory((items) => [entry, ...items.filter((item) => item.id !== entry.id)].slice(0, 100));
    if (entry.response || entry.error) setLastOutput(entry.response ?? entry.error ?? '');
  }), [connection]);

  const runCommand = async (command: string, mode: ConsoleMode, source: string, catalogSafety?: SafetyClass) => {
    const safetyClass = catalogSafety ?? classifyCommand(command);
    if (!canRunSafety(safetyClass, connection.advancedMode)) {
      setLastOutput(`Blocked by safety gate (${safetyClass}). Enable Advanced mode in Settings only on a trusted save/network.`);
      return;
    }
    if (needsConfirmation(safetyClass) && !window.confirm(`Review command before execution:\n\n${command}\n\nSafety: ${safetyLabel(safetyClass)}\n\nExecute?`)) return;
    const result = await queue.enqueue({ command, mode, source, safetyClass });
    const ledgerEntry = result.status === 'succeeded' ? ledgerEntryFromCommand(command) : null;
    if (ledgerEntry) setLedger((items) => [ledgerEntry, ...items]);
  };

  const refreshStats = async () => {
    for (const stat of stats) {
      const result = await queue.enqueue({ command: stat.command, mode: 'command', source: `stat:${stat.id}`, safetyClass: 'safe' });
      if (result.status === 'succeeded') {
        setStats((items) => items.map((item) => item.id === stat.id ? { ...item, value: parseStatValue(result.response ?? ''), raw: result.response ?? '', observedAt: new Date().toISOString() } : item));
      }
    }
  };

  const connectStream = () => {
    streamRef.current = new StreamClient(
      () => getStreamEndpoint(connection),
      setStreamStatus,
      (line) => setLogs((items) => paused ? items : appendBounded(items, line))
    );
    streamRef.current.connect();
  };

  const disconnectStream = () => streamRef.current?.disconnect();
  const checkServer = async () => {
    setHealth({ status: 'checking', message: `Probing ${connection.baseUrl}...` });
    const result = await new ConsoleApi(connection).checkHealth();
    setHealth({ status: result.ok ? 'online' : 'offline', checkedAt: new Date().toISOString(), latencyMs: result.latencyMs, message: result.message });
    if (!result.ok) setScreen('settings');
  };

  const refreshTelemetrySnapshot = useCallback(async () => {
    setTelemetryState('loading');
    setTelemetryMessage('Requesting the latest native telemetry snapshot...');
    try {
      const snapshot = await new TelemetryApi(connection).fetchSnapshot();
      setTelemetrySnapshot(snapshot);
      setTelemetryState('ready');
      setTelemetryCheckedAt(new Date().toISOString());
      setTelemetryMessage(snapshot.warnings.length ? snapshot.warnings[0] : snapshot.available ? 'Native telemetry loaded with fallback-safe values where needed.' : 'Native telemetry is currently unavailable and is returning safe fallback data only.');
    } catch (error) {
      setTelemetryState('error');
      setTelemetryCheckedAt(new Date().toISOString());
      setTelemetryMessage(error instanceof Error ? error.message : 'Unable to load native telemetry.');
    }
  }, [connection]);

  useEffect(() => {
    if (screen === 'dashboard' && health.status === 'online') {
      void refreshTelemetrySnapshot();
    }
  }, [screen, health.status, refreshTelemetrySnapshot]);

  const visibleLogs = logs.filter((line) => line.text.toLowerCase().includes(logFilter.toLowerCase()));
  const filteredCatalog = catalog.filter((item) => `${item.title} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(catalogSearch.toLowerCase()));
  const filteredLedger = ledger.filter((item) => `${item.itemId} ${item.displayName} ${item.notes}`.toLowerCase().includes(ledgerFilter.toLowerCase()));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Constellation field link</p>
          <h1>Starfield Command Deck</h1>
        </div>
        <div className="top-actions"><span className={`status-dot ${health.status}`}>{health.status}</span><span className={`status-dot ${streamStatus}`}>SSE {streamStatus}</span></div>
      </header>

      <section className="content">
        {screen === 'dashboard' && <Dashboard stats={stats} logs={logs} history={history} ledger={ledger} connection={connection} health={health} telemetrySnapshot={telemetrySnapshot} telemetryState={telemetryState} telemetryMessage={telemetryMessage} telemetryCheckedAt={telemetryCheckedAt} checkServer={checkServer} refreshTelemetrySnapshot={refreshTelemetrySnapshot} refreshStats={refreshStats} setScreen={setScreen} runCommand={runCommand} />}
        {screen === 'console' && <ConsoleScreen command={freeCommand} setCommand={setFreeCommand} mode={freeMode} setMode={setFreeMode} runCommand={runCommand} lastOutput={lastOutput} logs={visibleLogs} logFilter={logFilter} setLogFilter={setLogFilter} paused={paused} setPaused={setPaused} connectStream={connectStream} disconnectStream={disconnectStream} clearLogs={() => setLogs([])} streamStatus={streamStatus} favoriteName={favoriteName} setFavoriteName={setFavoriteName} addFavorite={() => {
          if (!freeCommand.trim()) return;
          setFavorites((items) => [{ id: crypto.randomUUID(), name: favoriteName || freeCommand, command: freeCommand, mode: freeMode, safetyClass: classifyCommand(freeCommand) }, ...items]);
          setFavoriteName('');
        }} />}
        {screen === 'catalog' && <CatalogScreen catalog={filteredCatalog} search={catalogSearch} setSearch={setCatalogSearch} runCommand={runCommand} addFavorite={(command, title, mode, safetyClass) => setFavorites((items) => [{ id: crypto.randomUUID(), name: title, command, mode, safetyClass }, ...items])} />}
        {screen === 'favorites' && <FavoritesScreen favorites={favorites} macros={macros} macroDraft={macroDraft} setMacroDraft={setMacroDraft} runCommand={runCommand} removeFavorite={(id) => setFavorites((items) => items.filter((item) => item.id !== id))} saveMacro={() => setMacros((items) => [{ id: crypto.randomUUID(), name: `Macro ${items.length + 1}`, stopOnError: true, steps: macroDraft.split('\n').filter(Boolean).map((command) => ({ id: crypto.randomUUID(), command, mode: 'command', delayMs: 250 })) }, ...items])} removeMacro={(id) => setMacros((items) => items.filter((item) => item.id !== id))} />}
        {screen === 'inventory' && <InventoryScreen ledger={filteredLedger} filter={ledgerFilter} setFilter={setLedgerFilter} addManual={(entry) => setLedger((items) => [entry, ...items])} removeEntry={(id) => setLedger((items) => items.filter((item) => item.id !== id))} />}
        {screen === 'settings' && <SettingsScreen connection={connection} setConnection={setConnection} health={health} checkServer={checkServer} reset={() => setConnection(defaultConnectionSettings)} exportData={() => navigator.clipboard.writeText(storage.exportBackup())} importData={(json) => { storage.importBackup(json); window.location.reload(); }} />}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {(['dashboard', 'console', 'catalog', 'favorites', 'inventory', 'settings'] as Screen[]).map((item) => <button key={item} className={screen === item ? 'active' : ''} onClick={() => setScreen(item)}>{item}</button>)}
      </nav>
    </main>
  );
}

function Dashboard({ stats, logs, history, ledger, connection, health, telemetrySnapshot, telemetryState, telemetryMessage, telemetryCheckedAt, checkServer, refreshTelemetrySnapshot, refreshStats, setScreen, runCommand }: { stats: PlayerStatSnapshot[]; logs: StreamLogLine[]; history: CommandHistoryEntry[]; ledger: InventoryLedgerEntry[]; connection: ConnectionSettings; health: ServerHealth; telemetrySnapshot: TelemetrySnapshotResponse | null; telemetryState: 'idle' | 'loading' | 'ready' | 'error'; telemetryMessage: string; telemetryCheckedAt: string | null; checkServer: () => void; refreshTelemetrySnapshot: () => void; refreshStats: () => void; setScreen: (screen: Screen) => void; runCommand: (command: string, mode: ConsoleMode, source: string, safety?: SafetyClass) => void }) {
  const trackedTotal = ledger.reduce((sum, entry) => sum + entry.quantityDelta, 0);
  const status = telemetrySnapshot?.data.status;
  const player = telemetrySnapshot?.data.player;
  const location = telemetrySnapshot?.data.location;
  const featureEntries = telemetryFeatureEntries(status?.data.features);
  const playerStats = player?.data;
  const locationData = location?.data;

  return (
    <div className="stack">
      <section className="panel hero star-map">
        <div>
          <p className="eyebrow">Mobile bridge for Starfield</p>
          <h2>Command, track, and cheat from a phone-ready flight deck.</h2>
          <p>Probe any SFSE Console API endpoint, serialize commands, monitor decoded console telemetry, run curated cheats, and maintain local tracking where the vanilla console cannot provide structured data.</p>
        </div>
        <div className="button-row">
          <button onClick={checkServer}>Detect server</button>
          <button onClick={refreshStats}>Scan stats</button>
          <button onClick={() => setScreen('console')}>Open console</button>
        </div>
      </section>

      <section className={`panel connection-banner ${health.status}`}>
        <h2>{health.status === 'online' ? 'Endpoint online' : health.status === 'offline' ? 'Endpoint details required' : 'Endpoint check'}</h2>
        <p><strong>{connection.endpointLabel || 'Console API'}:</strong> {connection.baseUrl}</p>
        <p>{health.message}</p>
        {health.latencyMs ? <small>{health.latencyMs} ms · {health.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : ''}</small> : null}
        {health.status === 'offline' && <button onClick={() => setScreen('settings')}>Enter external endpoint</button>}
      </section>

      <section className="panel">
        <div className="button-row">
          <div>
            <p className="eyebrow">Native telemetry</p>
            <h2>Safe fallback snapshot</h2>
          </div>
          <button onClick={refreshTelemetrySnapshot} disabled={telemetryState === 'loading'}>{telemetryState === 'loading' ? 'Refreshing…' : 'Refresh snapshot'}</button>
        </div>
        <p>{telemetryMessage}</p>
        <div className="card-grid">
          <article className="stat-card">
            <span>Snapshot status</span>
            <strong>{telemetryState}</strong>
            <small>Checked {telemetryCheckedAt ? telemetryTimestampLabel(telemetryCheckedAt) : 'not yet'}</small>
          </article>
          <article className="stat-card">
            <span>Source / confidence</span>
            <strong>{telemetrySnapshot ? `${status?.source ?? 'unknown'} · ${status?.confidence ?? 'unknown'}` : 'No snapshot'}</strong>
            <small>Generated {telemetrySnapshot ? telemetryTimestampLabel(telemetrySnapshot.generatedAt) : 'not yet'}</small>
          </article>
          <article className="stat-card">
            <span>Player confidence</span>
            <strong>{telemetrySnapshot ? telemetryConfidenceLabel(player?.confidence) : 'Unknown'}</strong>
            <small>Updated {telemetrySnapshot ? telemetryTimestampLabel(player?.generatedAt) : 'not available'}</small>
          </article>
          <article className="stat-card">
            <span>Location confidence</span>
            <strong>{telemetrySnapshot ? telemetryConfidenceLabel(location?.confidence) : 'Unknown'}</strong>
            <small>Updated {telemetrySnapshot ? telemetryTimestampLabel(location?.generatedAt) : 'not available'}</small>
          </article>
        </div>

        <div className="card-grid">
          <article className="stat-card">
            <span>Player / location envelope</span>
            <strong>{telemetrySnapshot ? `${telemetryBooleanLabel(player?.available)} · ${telemetryBooleanLabel(location?.available)}` : 'Unknown'}</strong>
            <small>Fields may remain null until native hooks are expanded.</small>
          </article>
          <article className="stat-card">
            <span>Snapshot freshness</span>
            <strong>{telemetrySnapshot ? `${telemetrySnapshot.ttlMs} ms${telemetrySnapshot.stale ? ' · stale' : ''}` : 'Unknown'}</strong>
            <small>{telemetrySnapshot?.warnings[0] || 'Fallback/unknown values are expected until native data expands.'}</small>
          </article>
        </div>

        <section className="card-grid">
          {featureEntries.map(([key, value]) => <article className="stat-card" key={key}><span>{key}</span><strong>{telemetryBooleanLabel(value)}</strong><small>Feature flag</small></article>)}
        </section>

        <section className="card-grid">
          <article className="stat-card">
            <span>Player</span>
            <strong>{telemetryLabel(playerStats?.name)}</strong>
            <small>Level {telemetryLabel(playerStats?.level === null ? null : String(playerStats?.level))} · HP {telemetryLabel(playerStats?.health.current === null ? null : String(playerStats?.health.current))} / {telemetryLabel(playerStats?.health.maximum === null ? null : String(playerStats?.health.maximum))}</small>
            <small>O2 {telemetryLabel(playerStats?.oxygen.current === null ? null : String(playerStats?.oxygen.current))} / {telemetryLabel(playerStats?.oxygen.maximum === null ? null : String(playerStats?.oxygen.maximum))} · Carry {telemetryLabel(playerStats?.carryWeight.current === null ? null : String(playerStats?.carryWeight.current))} / {telemetryLabel(playerStats?.carryWeight.maximum === null ? null : String(playerStats?.carryWeight.maximum))}</small>
          </article>
          <article className="stat-card">
            <span>Location</span>
            <strong>{telemetryLabel(locationData?.cell.name || locationData?.worldspace.name || locationData?.planet.name)}</strong>
            <small>Loaded: {telemetryBooleanLabel(locationData?.loaded)} · Interior: {telemetryBooleanLabel(locationData?.interior)}</small>
            <small>{telemetryLabel(locationData?.cell.editorId || locationData?.worldspace.editorId || locationData?.planet.system)}</small>
          </article>
        </section>

        <p>Native telemetry remains a read-only, progressive enhancement layer. Console commands, catalog actions, favorites, and the local inventory ledger continue to work even when these endpoints return fallback schemas.</p>
      </section>

      <section className="card-grid">{stats.map((stat) => <article className="stat-card" key={stat.id}><span>{stat.group || 'Telemetry'} · {stat.label}</span><strong>{stat.value}</strong><small>{stat.observedAt ? new Date(stat.observedAt).toLocaleTimeString() : stat.command}</small></article>)}</section>
      <section className="panel"><h2>Quick cheat rail</h2><div className="quick-grid">{quickCheats.map((item) => <button key={item.id} className={`quick-card ${item.safetyClass}`} onClick={() => runCommand(item.commandTemplate, item.defaultMode, `quick:${item.id}`, item.safetyClass)}><span>{item.category}</span><strong>{item.title}</strong></button>)}</div></section>
      <section className="card-grid"><article className="stat-card"><span>Tracked ledger delta</span><strong>{trackedTotal > 0 ? '+' : ''}{trackedTotal}</strong><small>Local estimate only</small></article><article className="stat-card"><span>Command history</span><strong>{history.length}</strong><small>Last command: {history[0]?.command || 'None'}</small></article><article className="stat-card"><span>Stream log lines</span><strong>{logs.length}</strong><small>Decoded SSE output</small></article></section>
    </div>
  );
}

function ConsoleScreen(props: { command: string; setCommand: (v: string) => void; mode: ConsoleMode; setMode: (v: ConsoleMode) => void; runCommand: (command: string, mode: ConsoleMode, source: string) => void; lastOutput: string; logs: StreamLogLine[]; logFilter: string; setLogFilter: (v: string) => void; paused: boolean; setPaused: (v: boolean) => void; connectStream: () => void; disconnectStream: () => void; clearLogs: () => void; streamStatus: StreamStatus; favoriteName: string; setFavoriteName: (v: string) => void; addFavorite: () => void }) {
  return <div className="stack"><section className="panel"><h2>Command runner</h2><textarea value={props.command} onChange={(event) => props.setCommand(event.target.value)} rows={4} /><div className="sticky-actions"><select value={props.mode} onChange={(event) => props.setMode(event.target.value as ConsoleMode)}><option value="command">Captured response</option><option value="stream">Fire-and-return</option></select><button onClick={() => props.runCommand(props.command, props.mode, 'console')}>Run serialized</button></div><div className="inline-form"><input placeholder="Favorite name" value={props.favoriteName} onChange={(event) => props.setFavoriteName(event.target.value)} /><button onClick={props.addFavorite}>Save favorite</button></div><pre>{props.lastOutput || 'Captured command output appears here.'}</pre></section><section className="panel"><h2>SSE log viewer</h2><div className="button-row"><button onClick={props.connectStream}>Connect</button><button onClick={props.disconnectStream}>Disconnect</button><button onClick={() => props.setPaused(!props.paused)}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.clearLogs}>Clear</button></div><input placeholder="Filter logs" value={props.logFilter} onChange={(event) => props.setLogFilter(event.target.value)} /><pre className="log-view">{props.logs.map((line) => `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`).join('\n') || `Stream is ${props.streamStatus}.`}</pre></section></div>;
}

function CatalogScreen({ catalog, search, setSearch, runCommand, addFavorite }: { catalog: CommandDefinition[]; search: string; setSearch: (v: string) => void; runCommand: (command: string, mode: ConsoleMode, source: string, safety?: SafetyClass) => void; addFavorite: (command: string, title: string, mode: ConsoleMode, safety: SafetyClass) => void }) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  return <div className="stack"><section className="panel"><h2>Command catalog</h2><input placeholder="Search commands, categories, tags" value={search} onChange={(event) => setSearch(event.target.value)} /></section>{catalog.map((item) => { const command = materialize(item.commandTemplate, values[item.id] ?? Object.fromEntries((item.parameters ?? []).map((param) => [param.name, param.defaultValue ?? '']))); return <article className="panel command-card" key={item.id}><div><p className="eyebrow">{item.category} · {safetyLabel(item.safetyClass)}</p><h3>{item.title}</h3><p>{item.description}</p></div>{item.parameters?.map((param) => <label key={param.name}>{param.label}<input type={param.type === 'number' ? 'number' : 'text'} value={(values[item.id]?.[param.name] ?? param.defaultValue) || ''} onChange={(event) => setValues((state) => ({ ...state, [item.id]: { ...state[item.id], [param.name]: event.target.value } }))} /></label>)}<code>{command}</code><div className="button-row"><button onClick={() => runCommand(command, item.defaultMode, `catalog:${item.id}`, item.safetyClass)}>Run</button><button onClick={() => addFavorite(command, item.title, item.defaultMode, item.safetyClass)}>Favorite</button></div></article>; })}</div>;
}

function FavoritesScreen({ favorites, macros, macroDraft, setMacroDraft, runCommand, removeFavorite, saveMacro, removeMacro }: { favorites: FavoriteCommand[]; macros: Macro[]; macroDraft: string; setMacroDraft: (v: string) => void; runCommand: (command: string, mode: ConsoleMode, source: string, safety?: SafetyClass) => void; removeFavorite: (id: string) => void; saveMacro: () => void; removeMacro: (id: string) => void }) {
  const runMacro = async (macro: Macro) => { for (const step of macro.steps) await runCommand(step.command, step.mode, `macro:${macro.id}`, classifyCommand(step.command)); };
  return <div className="stack"><section className="panel"><h2>Favorites</h2>{favorites.map((fav) => <div className="list-row" key={fav.id}><div><strong>{fav.name}</strong><small>{fav.command}</small></div><button onClick={() => runCommand(fav.command, fav.mode, `favorite:${fav.id}`, fav.safetyClass)}>Run</button><button onClick={() => removeFavorite(fav.id)}>Delete</button></div>)}{!favorites.length && <p>No favorites yet. Save one from Console or Catalog.</p>}</section><section className="panel"><h2>Macros</h2><p>One command per line. Macros execute sequentially through the shared command queue.</p><textarea value={macroDraft} rows={5} onChange={(event) => setMacroDraft(event.target.value)} /><button onClick={saveMacro}>Save macro</button>{macros.map((macro) => <div className="list-row" key={macro.id}><div><strong>{macro.name}</strong><small>{macro.steps.length} steps</small></div><button onClick={() => runMacro(macro)}>Run</button><button onClick={() => removeMacro(macro.id)}>Delete</button></div>)}</section></div>;
}

function InventoryScreen({ ledger, filter, setFilter, addManual, removeEntry }: { ledger: InventoryLedgerEntry[]; filter: string; setFilter: (v: string) => void; addManual: (entry: InventoryLedgerEntry) => void; removeEntry: (id: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); addManual({ id: crypto.randomUUID(), itemId: String(data.get('itemId') || ''), displayName: String(data.get('displayName') || ''), quantityDelta: Number(data.get('quantityDelta') || 0), sourceCommand: 'manual', notes: String(data.get('notes') || 'Manual reconciliation'), timestamp: new Date().toISOString() }); event.currentTarget.reset(); };
  return <div className="stack"><section className="panel"><h2>Inventory shadow ledger</h2><p>This is an estimated local ledger for app-issued add/remove commands and manual notes, not an authoritative game inventory snapshot.</p><input placeholder="Filter ledger" value={filter} onChange={(event) => setFilter(event.target.value)} /><form className="grid-form" onSubmit={submit}><input name="itemId" placeholder="Item ID" required /><input name="displayName" placeholder="Display name" /><input name="quantityDelta" type="number" placeholder="Quantity delta" required /><input name="notes" placeholder="Notes" /><button>Add manual entry</button></form></section><section className="panel"><h2>Entries</h2>{ledger.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((entry) => <div className="list-row" key={entry.id}><div><strong>{entry.displayName || entry.itemId} ({entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta})</strong><small>{entry.itemId} · {new Date(entry.timestamp).toLocaleString()} · {entry.notes}</small></div><button onClick={() => removeEntry(entry.id)}>Delete</button></div>)}</section></div>;
}

function SettingsScreen({ connection, setConnection, health, checkServer, reset, exportData, importData }: { connection: ConnectionSettings; setConnection: (value: ConnectionSettings) => void; health: ServerHealth; checkServer: () => void; reset: () => void; exportData: () => void; importData: (json: string) => void }) {
  const [backup, setBackup] = useState('');
  return <div className="stack"><section className="panel"><h2>Endpoint settings</h2><p>If the default localhost server is not reachable from this browser or phone, switch to an external/LAN endpoint exposed by the SFSE plugin or a trusted proxy.</p><label>Endpoint profile<select value={connection.endpointMode || 'default'} onChange={(event) => setConnection({ ...connection, endpointMode: event.target.value as ConnectionSettings['endpointMode'], baseUrl: event.target.value === 'default' ? defaultConnectionSettings.baseUrl : connection.baseUrl })}><option value="default">Default local plugin</option><option value="external">External / LAN API endpoint</option></select></label><label>Endpoint label<input value={connection.endpointLabel || ''} placeholder="Gaming PC, Steam Deck, LAN proxy" onChange={(event) => setConnection({ ...connection, endpointLabel: event.target.value })} /></label><label>Base URL<input value={connection.baseUrl} placeholder="http://192.168.1.25:55555" onChange={(event) => setConnection({ ...connection, baseUrl: event.target.value, endpointMode: event.target.value.includes('127.0.0.1') || event.target.value.includes('localhost') ? 'default' : 'external' })} /></label><label>Default read timeout (ms)<input type="number" min="100" value={connection.defaultTimeoutMs} onChange={(event) => setConnection({ ...connection, defaultTimeoutMs: Number(event.target.value) })} /></label><label className="check"><input type="checkbox" checked={connection.advancedMode} onChange={(event) => setConnection({ ...connection, advancedMode: event.target.checked })} /> Advanced mode allows dangerous/blocked classes after confirmation</label><div className="button-row"><button onClick={checkServer}>Detect server</button><button onClick={reset}>Reset defaults</button></div><div className={`health-readout ${health.status}`}><strong>{health.status}</strong><span>{health.message}</span></div></section><section className="panel"><h2>Backup</h2><p>Export/import local settings, favorites, macros, stats, history, and ledger data.</p><div className="button-row"><button onClick={exportData}>Copy export JSON</button><button onClick={() => importData(backup)}>Import pasted JSON</button></div><textarea rows={6} value={backup} onChange={(event) => setBackup(event.target.value)} placeholder="Paste backup JSON here" /></section><section className="panel warning"><h2>Runtime safety</h2><p>Keep the plugin bound to localhost unless intentionally using a trusted LAN. The API executes raw console commands and external endpoints should only be used on networks you control.</p></section></div>;
}

import type {
  ConnectionSettings,
  TelemetryLocationResponse,
  TelemetryPlayerResponse,
  TelemetrySnapshotResponse,
  TelemetryStatusResponse
} from '../types';
import { normalizeBaseUrl } from './consoleApi';

export type TelemetryEndpointKind = 'status' | 'player' | 'location' | 'snapshot';

function encodeProxyTarget(target: string): string {
  return encodeURIComponent(normalizeBaseUrl(target));
}

export function getTelemetryEndpoint(config: ConnectionSettings, kind: TelemetryEndpointKind): string {
  if (config.transportMode === 'proxy') {
    return `/api/${kind}?target=${encodeProxyTarget(config.baseUrl)}`;
  }

  const base = normalizeBaseUrl(config.baseUrl);
  return `${base}/api/${kind}`;
}

export class TelemetryApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class TelemetryApi {
  constructor(private readonly config: ConnectionSettings) {}

  async fetchStatus(timeoutMs = 2500): Promise<TelemetryStatusResponse> {
    return this.fetchJson<TelemetryStatusResponse>('status', timeoutMs);
  }

  async fetchPlayer(timeoutMs = 2500): Promise<TelemetryPlayerResponse> {
    return this.fetchJson<TelemetryPlayerResponse>('player', timeoutMs);
  }

  async fetchLocation(timeoutMs = 2500): Promise<TelemetryLocationResponse> {
    return this.fetchJson<TelemetryLocationResponse>('location', timeoutMs);
  }

  async fetchSnapshot(timeoutMs = 2500): Promise<TelemetrySnapshotResponse> {
    return this.fetchJson<TelemetrySnapshotResponse>('snapshot', timeoutMs);
  }

  private async fetchJson<T>(kind: TelemetryEndpointKind, timeoutMs: number): Promise<T> {
    const endpoint = getTelemetryEndpoint(this.config, kind);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new TelemetryApiError(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof TelemetryApiError) throw error;
      const message = error instanceof Error && error.name === 'AbortError'
        ? `Timed out while requesting ${endpoint}.`
        : `Unable to reach the native telemetry endpoint at ${endpoint}.`;
      throw new TelemetryApiError(message, error);
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

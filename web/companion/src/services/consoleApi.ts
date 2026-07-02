import type { ConnectionSettings } from '../types';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function encodeProxyTarget(target: string): string {
  return encodeURIComponent(normalizeBaseUrl(target));
}

function getProxyPath(config: ConnectionSettings, kind: 'console' | 'stream'): string {
  const target = encodeProxyTarget(config.baseUrl);
  return `/api/${kind}?target=${target}`;
}

export function getConsoleEndpoint(config: ConnectionSettings): string {
  if (config.transportMode === 'proxy') {
    return getProxyPath(config, 'console');
  }
  const base = normalizeBaseUrl(config.baseUrl);
  return `${base}/console`;
}

export function getStreamEndpoint(config: ConnectionSettings): string {
  if (config.transportMode === 'proxy') {
    return getProxyPath(config, 'stream');
  }
  const base = normalizeBaseUrl(config.baseUrl);
  return `${base}/stream`;
}

export class ConsoleApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class ConsoleApi {
  constructor(private readonly config: ConnectionSettings) {}

  async checkHealth(timeoutMs = 2500): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${getConsoleEndpoint(this.config)}${getConsoleEndpoint(this.config).includes('?') ? '&' : '?'}mode=command&timeout=150`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: 'help player',
        signal: controller.signal
      });
      const text = await response.text();
      const latencyMs = Math.round(performance.now() - started);
      if (!response.ok) return { ok: false, latencyMs, message: `HTTP ${response.status}: ${text || response.statusText}` };
      return { ok: true, latencyMs, message: text.trim() ? 'Console API responded to command probe.' : 'Console API responded; no text returned during short probe.' };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'Connection timed out. Verify Starfield is running, the plugin web console is enabled, and the endpoint is reachable.'
        : 'Server probe failed. Enter the external endpoint if the API is hosted elsewhere, then retry.';
      return { ok: false, latencyMs, message };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async runCommand(command: string, timeoutMs = this.config.defaultTimeoutMs): Promise<string> {
    return this.postConsole(command, `mode=command&timeout=${encodeURIComponent(timeoutMs)}`);
  }

  async streamCommand(command: string): Promise<void> {
    await this.postConsole(command, 'mode=stream');
  }

  private async postConsole(command: string, query: string): Promise<string> {
    const endpoint = getConsoleEndpoint(this.config);
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: command
      });
      const text = await response.text();
      if (!response.ok) throw new ConsoleApiError(`HTTP ${response.status}: ${text || response.statusText}`);
      return text;
    } catch (error) {
      if (error instanceof ConsoleApiError) throw error;
      throw new ConsoleApiError('Unable to reach the SFSE console API. Check host, port, CORS, and whether the plugin web console is enabled.', error);
    }
  }
}

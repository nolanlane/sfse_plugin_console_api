import { maxStreamLines } from '../config/defaults';
import type { StreamLogLine } from '../types';

export type StreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function decodeBase64Utf8(payload: string): string {
  const binary = atob(payload.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class StreamClient {
  private source?: EventSource;
  private reconnect?: number;
  private attempts = 0;

  constructor(
    private readonly getStreamUrl: () => string,
    private readonly onStatus: (status: StreamStatus) => void,
    private readonly onLine: (line: StreamLogLine) => void
  ) {}

  connect(): void {
    this.disconnect(false);
    this.onStatus('connecting');
    const source = new EventSource(this.getStreamUrl());
    this.source = source;
    source.onopen = () => {
      this.attempts = 0;
      this.onStatus('connected');
    };
    source.onmessage = (event) => {
      decodeBase64Utf8(event.data)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter(Boolean)
        .forEach((text) => this.onLine({ id: crypto.randomUUID(), text, timestamp: new Date().toISOString() }));
    };
    source.onerror = () => {
      this.onStatus('error');
      this.disconnect(false);
      const delay = Math.min(10000, 800 * 2 ** this.attempts++);
      this.reconnect = window.setTimeout(() => this.connect(), delay);
    };
  }

  disconnect(updateStatus = true): void {
    window.clearTimeout(this.reconnect);
    this.source?.close();
    this.source = undefined;
    if (updateStatus) this.onStatus('disconnected');
  }
}

export function appendBounded(lines: StreamLogLine[], line: StreamLogLine): StreamLogLine[] {
  return [...lines, line].slice(-maxStreamLines);
}

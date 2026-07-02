import { ConsoleApi } from './consoleApi';
import type { CommandHistoryEntry, ConnectionSettings, ConsoleMode, SafetyClass } from '../types';

export interface QueueRequest {
  command: string;
  mode: ConsoleMode;
  safetyClass: SafetyClass;
  source: string;
  delayMs?: number;
}

export class CommandQueue {
  private chain = Promise.resolve();

  constructor(
    private readonly getConnection: () => ConnectionSettings,
    private readonly onHistory: (entry: CommandHistoryEntry) => void
  ) {}

  enqueue(request: QueueRequest): Promise<CommandHistoryEntry> {
    const run = async () => {
      const id = crypto.randomUUID();
      const running: CommandHistoryEntry = { id, ...request, status: 'running', timestamp: new Date().toISOString() };
      this.onHistory(running);
      if (request.delayMs) await new Promise((resolve) => window.setTimeout(resolve, request.delayMs));
      try {
        const api = new ConsoleApi(this.getConnection());
        const response = request.mode === 'stream' ? await api.streamCommand(request.command).then(() => 'Sent to stream mode.') : await api.runCommand(request.command);
        const succeeded = { ...running, status: 'succeeded' as const, response };
        this.onHistory(succeeded);
        return succeeded;
      } catch (error) {
        const failed = { ...running, status: 'failed' as const, error: error instanceof Error ? error.message : String(error) };
        this.onHistory(failed);
        return failed;
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }
}

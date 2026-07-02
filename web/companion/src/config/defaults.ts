import type { ConnectionSettings } from '../types';

export const defaultConnectionSettings: ConnectionSettings = {
  baseUrl: 'http://127.0.0.1:55555',
  defaultTimeoutMs: 2000,
  advancedMode: false,
  endpointMode: 'default',
  endpointLabel: 'Local SFSE Console API',
  transportMode: 'direct',
  proxyBaseUrl: '/api/console'
};

export const maxStreamLines = 400;

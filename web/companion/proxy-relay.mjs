import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon']
]);

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function setHeader(res, name, value) {
  if (value !== undefined && value !== null) res.setHeader(name, value);
}

function copyHeaders(source, res) {
  for (const [key, value] of source.entries()) {
    const lower = key.toLowerCase();
    if (['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'].includes(lower)) continue;
    setHeader(res, key, value);
  }
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.end(text);
}

async function proxyApiRequest(req, res) {
  const requestUrl = new URL(req.url || '/', 'http://relay.local');
  if (!requestUrl.pathname.startsWith('/api/')) return false;

  const target = normalizeBaseUrl(requestUrl.searchParams.get('target'));
  if (!target) {
    sendText(res, 400, 'Missing target query parameter. Use ?target=http://host:port');
    return true;
  }

  const upstreamPath = requestUrl.pathname.replace(/^\/api/, '');
  const upstreamUrl = new URL(upstreamPath, `${target}/`);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key !== 'target') upstreamUrl.searchParams.append(key, value);
  }

  const headers = new Headers();
  const incoming = new Headers(req.headers);
  for (const name of ['content-type', 'accept', 'user-agent']) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }

  const init = {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
    duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half'
  };

  const upstreamResponse = await fetch(upstreamUrl, init);
  res.statusCode = upstreamResponse.status;
  copyHeaders(upstreamResponse.headers, res);
  setHeader(res, 'Access-Control-Allow-Origin', '*');
  setHeader(res, 'Access-Control-Allow-Headers', '*');
  setHeader(res, 'Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (!upstreamResponse.body) {
    res.end();
    return true;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(res);
  return true;
}

async function serveStaticFile(req, res, staticRoot) {
  if (!staticRoot) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const requestUrl = new URL(req.url || '/', 'http://relay.local');
  if (requestUrl.pathname.startsWith('/api/')) return false;

  const root = path.resolve(staticRoot);
  let candidate = path.join(root, decodeURIComponent(requestUrl.pathname));

  try {
    const stats = await fs.stat(candidate).catch(() => null);
    if (!stats || stats.isDirectory()) candidate = path.join(root, 'index.html');
    const fileStats = await fs.stat(candidate);
    const ext = path.extname(candidate).toLowerCase();
    res.statusCode = 200;
    setHeader(res, 'Content-Type', mimeTypes.get(ext) || 'application/octet-stream');
    setHeader(res, 'Cache-Control', 'no-cache');
    setHeader(res, 'Access-Control-Allow-Origin', '*');
    setHeader(res, 'Access-Control-Allow-Headers', '*');
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(candidate).pipe(res);
    return true;
  } catch {
    const indexPath = path.join(root, 'index.html');
    try {
      await fs.access(indexPath);
      res.statusCode = 200;
      setHeader(res, 'Content-Type', 'text/html; charset=utf-8');
      setHeader(res, 'Cache-Control', 'no-cache');
      if (req.method === 'HEAD') {
        res.end();
        return true;
      }
      createReadStream(indexPath).pipe(res);
      return true;
    } catch {
      sendText(res, 503, `Static bundle not found at ${indexPath}. Run the web app build first.`);
      return true;
    }
  }
}

export async function handleRelayRequest(req, res, options = {}) {
  const handled = await proxyApiRequest(req, res);
  if (handled) return true;
  if (await serveStaticFile(req, res, options.staticRoot)) return true;
  return false;
}

export function getDefaultStaticRoot() {
  return path.resolve(process.cwd(), 'dist');
}


import http from 'node:http';
import { handleRelayRequest, getDefaultStaticRoot } from './proxy-relay.mjs';

const port = Number(process.env.PORT || '4174');
const staticRoot = process.env.STATIC_ROOT || getDefaultStaticRoot();

const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleRelayRequest(req, res, { staticRoot });
    if (!handled) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Starfield companion relay listening on http://localhost:${port}`);
  console.log(`Serving static root: ${staticRoot}`);
});

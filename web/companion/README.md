# Starfield Companion Web App

Mobile-friendly static companion app for the `sfse_plugin_console_api` Starfield SFSE plugin. This scaffold is frontend-only and does not change the C++ plugin.

## Features in this scaffold

- Connection settings for default localhost or external/LAN plugin endpoints, default captured-command timeout, and endpoint labels persisted in local storage.
- Server detection probe that checks `/console`; if the server is offline the app highlights endpoint details in Settings.
- Raw console API client for `POST /console?mode=command&timeout=N` and `POST /console?mode=stream`.
- Serialized command queue so app-issued captured commands do not intentionally overlap global console output.
- `GET /stream` SSE client with base64 UTF-8 decoding, reconnect/backoff, pause, clear, and filtering.
- Freeform command runner with captured response output.
- Expanded categorized command catalog with player stats, inventory, credits, Digipicks/aid shortcuts, quest dumps, navigation coordinates, time controls, and cheat toggles.
- Local favorites and sequential macros.
- Starfield-themed command deck dashboard with player stat scan cards, quick cheat rail, endpoint health, decoded telemetry, and ledger summaries.
- Player stat cards backed by `player.getav`/console commands and best-effort text parsing.
- Estimated inventory shadow ledger for app-issued `player.additem`/`player.removeitem` commands plus manual entries.
- Client-side guardrails for confirmation, dangerous, and blocked commands.
- Dark, mobile-first UI with bottom navigation and large touch targets.

## Development

```bash
cd web/companion
npm install
npm run dev
```

If you want to avoid workspace ambiguity, use the repository-root wrapper instead:

```bash
npm install
npm run dev
```

Open the Vite URL on the same machine or trusted LAN. The app defaults to `http://127.0.0.1:55555` for the plugin API. For phone access, switch Settings to an external/LAN endpoint such as `http://192.168.1.25:55555`, assuming the plugin host binding and firewall allow access.

## Build

```bash
cd web/companion
npm run build
```

The static bundle is written to `web/companion/dist/`.

## Plugin connection

Expected plugin API endpoints:

- `POST /console?mode=command&timeout=N` with raw command text and captured text response.
- `POST /console?mode=stream` with raw command text and immediate return.
- `GET /stream` where each SSE `data:` payload is base64-encoded console output text.

Suggested plugin INI settings for local testing:

```ini
[Plugin]
bEnableWebConsole=1

[WebConsole]
sHost=127.0.0.1
iPort=55555
bDisableCORS=0
bDisableStaticFiles=0
sStaticFilesPath=Data\SFSE\plugins\sfse_plugin_console_api\
iExecTimeout=100
```

The frontend defaults captured command reads to 2000 ms because the plugin default can be too short for UI-driven interactions.

The companion app dev server uses Vite's default port selection and ignores common cache directories to reduce watcher pressure in large workspaces. If the first port is occupied, Vite falls back to the next available port instead of failing.

## Deploy as plugin-hosted static files

After building, copy the contents of `web/companion/dist/` into the configured static path, commonly:

```text
Data/SFSE/plugins/sfse_plugin_console_api/
```

Then open the plugin host URL, commonly `http://127.0.0.1:55555/`.

## Endpoint detection

Use **Detect server** from Dashboard or Settings before sending commands. The probe sends a short safe command to `/console`; online responses show latency and offline responses redirect attention to endpoint details. External endpoints should only point to trusted Starfield machines or trusted local proxies because every request can execute game console commands.

## External endpoint proxy mode

If the remote API does not expose CORS headers, set the app to proxy mode and place a same-origin relay in front of the Starfield machine. The app will target `/api/console` and `/api/stream` on the current origin, and your proxy should forward those calls to the remote `baseUrl`.

This avoids changing the plugin CORS settings while still allowing the browser to connect to another machine on your LAN.

In development, the Vite dev server can be paired with a small relay server that forwards `/api/*` requests to the `target` query parameter, so proxy mode works without changing the plugin when the API is hosted locally or on another machine.

For production or LAN hosting, build the app and run the relay server:

```bash
npm run build
npm run relay
```

The relay serves the built `dist/` bundle and proxies `/api/console` and `/api/stream` to the `target` URL supplied by the app.

## Safety note

The plugin API executes raw console commands. Keep it on localhost unless intentionally using a trusted LAN, and avoid exposing it to untrusted networks. Safety gates in this app are convenience guardrails only.

## Troubleshooting

- If `npm run dev` starts the wrong Vite project, use `npm --prefix web/companion run dev`.
- If you hit `ENOSPC`, close other dev servers, close unused editor windows, and restart. The app's Vite watcher already excludes `node_modules`, `.config`, `Cache`, and `.cache` folders and uses polling to avoid some filesystem watcher limits.

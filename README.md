# sfse_plugin_console_api
SFSE plugin for hosting a Starfield console execution and output API.  
Can be used with the web application from [sfse_plugin_console_web](https://github.com/dranger003/sfse_plugin_console_web).  
More info on [Nexusmods](https://www.nexusmods.com/starfield/mods/4280).

# Build
```
msbuild -p:Configuration=Release
```

## Companion web app

The repository now includes a Starfield companion web app in [`web/companion`](web/companion).

From the repository root:

```bash
npm install
npm run dev
```

Those commands delegate to the web app workspace.

If you prefer running the app package directly:

```bash
cd web/companion
npm install
npm run dev
```

If Vite hits an `ENOSPC` watcher limit, stop any other dev servers, close unused editor windows, and restart the app from the repository root so it only watches the `web/companion` workspace.

![ss-api-1](https://github.com/dranger003/sfse_plugin_console_api/assets/1760549/5fc4321e-f2f8-4a12-9335-b6263244cfd8)
![ss-api-2](https://github.com/dranger003/sfse_plugin_console_api/assets/1760549/8e429ab6-bd86-48aa-8480-c7c3e6d05f7a)

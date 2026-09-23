# Windows Desktop Launcher

Double-click:

```text
dist\API Hub Launcher.exe
```

The launcher:

1. keeps a single tray-controller instance;
2. checks whether `http://127.0.0.1:4310` is already healthy;
3. starts `node server.js` in a hidden window when needed;
4. waits for the health endpoint before opening the default browser;
5. remains in the Windows notification area;
6. opens API Hub when its tray icon is double-clicked;
7. stops its owned server gracefully from **Stop and exit**.

Graceful shutdown uses a random 256-bit launcher token passed only through the
child process environment. The shutdown endpoint is loopback-only, is disabled
when the server was not launcher-started, and returns 404 for an invalid token.
This allows SQLite to close its WAL and file handles before the process exits.

## Rebuild

```powershell
npm run build:launcher
```

The build uses the Windows .NET Framework C# compiler already present on this
machine and outputs the executable under the governed `dist/` generated zone.

## Verify lifecycle

Ensure port 4310 is free, then run:

```powershell
npm run test:launcher
```

The verification mode starts the hidden Node service, waits for health, requests
authenticated launcher shutdown, waits for process exit, and confirms that port
4310 is no longer serving.

## Packaging boundary

The development launcher at `dist/API Hub Launcher.exe` remains project-bound.
For a self-contained distribution, build:

```powershell
npm run build:portable
```

This produces:

```text
dist/API Hub Portable/API Hub.exe
dist/API-Hub-Portable-win-x64.zip
dist/API-Hub-Portable-win-x64.zip.sha256
```

The Portable package contains its own Node runtime and does not require Node.js
on PATH. Extract the complete folder and double-click `API Hub.exe`; do not move
the EXE out of that folder. Application data is created under the extracted
folder's `data/runtime` directory on first launch.

The release build uses a strict runtime-file allowlist and rejects `.env`, vault
key, and SQLite files before compression. It never copies the development
database or credential vault. After real credentials are added to a Portable
instance, treat its whole folder as private and do not redistribute it.

Verify the actual extracted ZIP without Node on PATH:

```powershell
npm run test:portable
```

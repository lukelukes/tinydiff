import { join } from 'node:path';

import { app, BrowserWindow, session, shell } from 'electron';

import { applyDevCsp, registerAppScheme, RENDERER_URL, serveRenderer } from './protocol';
import { devRenderer, httpUrl, withinRenderer } from './urls';

function log(message: string): void {
  process.stderr.write(`[tinydiff] ${message}\n`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function fail(context: string, error: unknown): void {
  log(`${context}: ${formatError(error)}`);
  app.exit(1);
}

function createWindow(rendererUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    title: 'TinyDiff',
    backgroundColor: '#18181b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  let reloaded = false;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('will-navigate', (event) => {
    if (!withinRenderer(rendererUrl, event.url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const external = httpUrl(url);
    if (external !== null) {
      shell.openExternal(external.href).catch((error: unknown) => {
        log(`failed to open ${external.href}: ${formatError(error)}`);
      });
    }
    return { action: 'deny' };
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log(`renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === 'clean-exit' || details.reason === 'killed' || reloaded) {
      return;
    }
    reloaded = true;
    win.webContents.reload();
  });

  return win;
}

function focusMainWindow(): void {
  const [win] = BrowserWindow.getAllWindows();
  if (win === undefined) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
}

function installRenderer(): string {
  const dev = devRenderer(process.env, app.isPackaged);
  if (dev === null) {
    serveRenderer(join(import.meta.dirname, '../renderer'));
    return RENDERER_URL;
  }
  applyDevCsp(dev.nonce);
  return dev.url;
}

async function start(): Promise<void> {
  await app.whenReady();

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  const rendererUrl = installRenderer();
  await createWindow(rendererUrl).loadURL(rendererUrl);
}

function bootstrap(): void {
  registerAppScheme();

  app.on('second-instance', (_event, argv, workingDirectory) => {
    log(`second instance launched in ${workingDirectory} with ${JSON.stringify(argv)}`);
    focusMainWindow();
  });

  app.on('child-process-gone', (_event, details) => {
    log(
      `${details.type} process${details.name ? ` ${details.name}` : ''} gone: ${details.reason} (exit code ${details.exitCode})`
    );
  });

  process.on('uncaughtException', (error) => {
    fail('uncaught exception', error);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  start().catch((error: unknown) => {
    fail('startup failed', error);
  });
}

app.setName('tinydiff');

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  app.exit(0);
}

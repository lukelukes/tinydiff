import { join } from 'node:path';

import { app, BrowserWindow, session, shell } from 'electron';

import type { AppMode } from '../../src/bindings/types';
import { describeError, resolveAppMode } from './app-mode';
import { DEV_CSP_NONCE_ENV, RENDERER_ORIGIN } from './csp';
import { devOrigin, rendererUrl } from './env';
import { externalUrl } from './external-url';
import { applyTheme, registerHandlers } from './handlers';
import { applyDevCsp, serveRenderer } from './protocol';
import { flushSettings, getSetting } from './settings';

let mainWindow: BrowserWindow | null = null;
let rendererReloaded = false;

function log(message: string): void {
  process.stderr.write(`[tinydiff] ${message}\n`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith(`${RENDERER_ORIGIN}/`)) {
    return true;
  }
  return devOrigin !== null && URL.parse(url)?.origin === devOrigin;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    title: 'TinyDiff',
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('will-navigate', (event) => {
    if (!isAllowedNavigation(event.url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const external = externalUrl(url);
    if (external !== null) {
      shell.openExternal(external).catch((error: unknown) => {
        log(`failed to open ${external}: ${formatError(error)}`);
      });
    }
    return { action: 'deny' };
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function focusMainWindow(): void {
  if (mainWindow === null) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

async function start(appMode: AppMode): Promise<void> {
  await app.whenReady();

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  if (rendererUrl) {
    applyDevCsp(process.env[DEV_CSP_NONCE_ENV]);
  } else {
    serveRenderer(join(import.meta.dirname, '../renderer'));
  }

  applyTheme(getSetting('theme'));
  registerHandlers(appMode);
  const win = createWindow();
  mainWindow = win;
  await win.loadURL(rendererUrl ?? `${RENDERER_ORIGIN}/`);
}

function bootstrap(appMode: AppMode): void {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    log(`second instance launched in ${workingDirectory} with ${JSON.stringify(argv)}`);
    focusMainWindow();
  });

  app.on('render-process-gone', (_event, contents, details) => {
    log(`renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === 'clean-exit' || details.reason === 'killed' || rendererReloaded) {
      return;
    }
    rendererReloaded = true;
    contents.reload();
  });

  app.on('child-process-gone', (_event, details) => {
    log(
      `${details.type} process${details.name ? ` ${details.name}` : ''} gone: ${details.reason} (exit code ${details.exitCode})`
    );
  });

  process.on('uncaughtException', (error) => {
    log(`uncaught exception: ${error.stack ?? error.message}`);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('will-quit', () => {
    flushSettings();
  });

  start(appMode).catch((error: unknown) => {
    log(`startup failed: ${formatError(error)}`);
    app.exit(1);
  });
}

app.setName('tinydiff');

const appMode = resolveAppMode(process.argv);

if (appMode.status === 'error') {
  log(describeError(appMode.error));
  app.exit(1);
} else if (app.requestSingleInstanceLock()) {
  bootstrap(appMode.data);
} else {
  app.exit(0);
}

import { join } from 'node:path';

import { app, BrowserWindow, session, shell } from 'electron';

import { DEV_CSP_NONCE_ENV, RENDERER_ORIGIN } from './csp';
import { applyDevCsp, serveRenderer } from './protocol';

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const devOrigin = rendererUrl ? new URL(rendererUrl).origin : null;

let mainWindow: BrowserWindow | null = null;
let rendererReloaded = false;

function log(message: string): void {
  process.stderr.write(`[tinydiff] ${message}\n`);
}

function isExternal(url: string): boolean {
  return url.startsWith('https:') || url.startsWith('http:');
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith(`${RENDERER_ORIGIN}/`)) {
    return true;
  }
  return devOrigin !== null && originOf(url) === devOrigin;
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

  win.once('ready-to-show', () => win.show());

  win.webContents.on('will-navigate', (event) => {
    if (!isAllowedNavigation(event.url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  void win.loadURL(rendererUrl ?? `${RENDERER_ORIGIN}/`);
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

function bootstrap(): void {
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

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false)
    );
    session.defaultSession.setPermissionCheckHandler(() => false);

    if (rendererUrl) {
      applyDevCsp(process.env[DEV_CSP_NONCE_ENV]);
    } else {
      serveRenderer(join(import.meta.dirname, '../renderer'));
    }

    mainWindow = createWindow();
  });
}

app.setName('tinydiff');

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  app.exit(0);
}

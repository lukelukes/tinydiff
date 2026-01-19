import type {
  AppMode,
  Comment,
  CommentCollection,
  CommandError,
  DiffTarget,
  GitFileContents,
  GitStatus
} from '#tauri-bindings/index';

import { fileContentsMap, binaryFiles } from './fixtures/file-contents';
import { mockGitStatus } from './fixtures/git-status';

type InvokeArgs = Record<string, unknown>;

const MOCK_REPO_PATH = '/home/user/projects/my-app';

const storeData = new Map<string, unknown>();

const commentsData: CommentCollection = {
  comments: [
    {
      id: 'comment-1',
      filePath: 'src/features/diff-viewer/diff-viewer.tsx',
      lineNumber: 45,
      body: 'Consider memoizing this function to avoid recalculation on each render.',
      resolved: false,
      createdAt: Math.floor(Date.now() / 1000) - 3600,
      updatedAt: Math.floor(Date.now() / 1000) - 3600
    },
    {
      id: 'comment-2',
      filePath: 'src/features/diff-viewer/diff-viewer.tsx',
      lineNumber: 112,
      body: 'This timeout value should probably be configurable.',
      resolved: true,
      createdAt: Math.floor(Date.now() / 1000) - 7200,
      updatedAt: Math.floor(Date.now() / 1000) - 1800
    },
    {
      id: 'comment-3',
      filePath: 'src-tauri/src/comments.rs',
      lineNumber: 28,
      body: 'Nice use of the builder pattern here!',
      resolved: false,
      createdAt: Math.floor(Date.now() / 1000) - 86400,
      updatedAt: Math.floor(Date.now() / 1000) - 86400
    }
  ]
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwError(error: CommandError): never {
  throw error;
}

async function handleGetAppMode(): Promise<AppMode> {
  return { type: 'git', path: MOCK_REPO_PATH };
}

async function handleGetGitStatus(_path: string): Promise<GitStatus> {
  await delay(100);
  return mockGitStatus;
}

async function handleGetFileDiff(
  _repoPath: string,
  filePath: string,
  _target: DiffTarget
): Promise<unknown> {
  await delay(50);

  const contents = fileContentsMap[filePath] || binaryFiles[filePath];
  if (!contents) {
    throwError({ type: 'path', path: filePath, message: 'File not found in fixtures' });
  }

  return {
    path: filePath,
    oldPath: null,
    hunks: [],
    isBinary:
      contents.oldFile.content?.type === 'binary' || contents.newFile.content?.type === 'binary'
  };
}

async function handleGetGitFileContents(
  _repoPath: string,
  filePath: string,
  _target: DiffTarget
): Promise<GitFileContents> {
  await delay(80);

  const contents = fileContentsMap[filePath] || binaryFiles[filePath];
  if (!contents) {
    throwError({ type: 'path', path: filePath, message: 'File not found in fixtures' });
  }

  return contents;
}

async function handleLoadComments(_repoPath: string): Promise<CommentCollection> {
  await delay(30);
  return commentsData;
}

async function handleSaveComment(
  _repoPath: string,
  comment: Comment,
  _fileContents: string | null
): Promise<null> {
  await delay(50);

  const existingIndex = commentsData.comments.findIndex((c) => c.id === comment.id);
  if (existingIndex >= 0) {
    commentsData.comments[existingIndex] = comment;
  } else {
    commentsData.comments.push(comment);
  }

  return null;
}

async function handleDeleteComment(_repoPath: string, commentId: string): Promise<boolean> {
  await delay(30);

  const index = commentsData.comments.findIndex((c) => c.id === commentId);
  if (index >= 0) {
    commentsData.comments.splice(index, 1);
    return true;
  }

  return false;
}

async function handleGetCommentsForFile(
  _repoPath: string,
  filePath: string,
  _fileContents: string
): Promise<Comment[]> {
  await delay(30);

  const fileComments = commentsData.comments.filter((c) => c.filePath === filePath);
  return fileComments;
}

async function handlePluginStore(cmd: string, args: InvokeArgs): Promise<unknown> {
  const key = args.key as string;
  const path = (args.path as string) || 'default';
  const storeKey = `${path}:${key}`;

  switch (cmd) {
    case 'plugin:store|get':
      return storeData.get(storeKey) ?? null;
    case 'plugin:store|set':
      storeData.set(storeKey, args.value);
      return null;
    case 'plugin:store|delete':
      storeData.delete(storeKey);
      return null;
    case 'plugin:store|save':
      return null;
    case 'plugin:store|clear':
      for (const k of storeData.keys()) {
        if (k.startsWith(`${path}:`)) {
          storeData.delete(k);
        }
      }
      return null;
    default:
      throw new Error(`Unknown store command: ${cmd}`);
  }
}

async function handlePluginOpener(cmd: string, args: InvokeArgs): Promise<unknown> {
  switch (cmd) {
    case 'plugin:opener|open_url':
      console.log('[Mock] Opening URL:', args.url);
      window.open(args.url as string, '_blank');
      return null;
    case 'plugin:opener|open_path':
      console.log('[Mock] Opening path:', args.path);
      return null;
    case 'plugin:opener|reveal_item_in_dir':
      console.log('[Mock] Revealing in finder:', args.path);
      return null;
    default:
      throw new Error(`Unknown opener command: ${cmd}`);
  }
}

async function mockInvoke(cmd: string, args?: InvokeArgs): Promise<unknown> {
  console.log('[Tauri Mock] invoke:', cmd, args);

  if (cmd.startsWith('plugin:store|')) {
    return handlePluginStore(cmd, args ?? {});
  }

  if (cmd.startsWith('plugin:opener|')) {
    return handlePluginOpener(cmd, args ?? {});
  }

  switch (cmd) {
    case 'get_app_mode':
      return handleGetAppMode();

    case 'get_git_status':
      return handleGetGitStatus(args?.path as string);

    case 'get_file_diff':
      return handleGetFileDiff(
        args?.repoPath as string,
        args?.filePath as string,
        args?.target as DiffTarget
      );

    case 'get_git_file_contents':
      return handleGetGitFileContents(
        args?.repoPath as string,
        args?.filePath as string,
        args?.target as DiffTarget
      );

    case 'load_comments':
      return handleLoadComments(args?.repoPath as string);

    case 'save_comment':
      return handleSaveComment(
        args?.repoPath as string,
        args?.comment as Comment,
        args?.fileContents as string | null
      );

    case 'delete_comment':
      return handleDeleteComment(args?.repoPath as string, args?.commentId as string);

    case 'get_comments_for_file':
      return handleGetCommentsForFile(
        args?.repoPath as string,
        args?.filePath as string,
        args?.fileContents as string
      );

    case 'read_file':
      return {
        name: args?.filePath || 'file.ts',
        contents: '// Mock file contents',
        lang: 'typescript',
        isBinary: false
      };

    default:
      console.warn('[Tauri Mock] Unknown command:', cmd);
      throw new Error(`Unknown command: ${cmd}`);
  }
}

type EventCallback<T = unknown> = (event: { event: string; payload: T }) => void;
type UnlistenFn = () => void;

const eventListeners = new Map<string, Set<EventCallback>>();

function mockListen<T>(event: string, callback: EventCallback<T>): UnlistenFn {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback as EventCallback);

  return () => {
    eventListeners.get(event)?.delete(callback as EventCallback);
  };
}

function mockEmit<T>(event: string, payload: T): void {
  eventListeners.get(event)?.forEach((cb) => cb({ event, payload }));
}

let callbackIdCounter = 0;
function mockTransformCallback(callback: (response: unknown) => void): number {
  const id = callbackIdCounter++;
  (window as Record<string, unknown>)[`_${id}`] = callback;
  return id;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: typeof mockInvoke;
      transformCallback: typeof mockTransformCallback;
      metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string };
      };
    };
    __TAURI_EVENT_PLUGIN_INTERNALS__?: {
      listen: typeof mockListen;
      emit: typeof mockEmit;
    };
    isTauri?: boolean;
  }
}

export function initTauriMock(): void {
  if (window.__TAURI_INTERNALS__) {
    console.log('[Tauri Mock] Already initialized, skipping');
    return;
  }

  window.__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    transformCallback: mockTransformCallback,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    listen: mockListen,
    emit: mockEmit
  };

  window.isTauri = true;

  console.log('[Tauri Mock] Initialized - running in browser dev mode');
  console.log('[Tauri Mock] Available files:', Object.keys(fileContentsMap));
}

initTauriMock();

import type { GitFileContents, DiffFile, FileContent } from '#tauri-bindings/index';

import commentsNew from './comments-new.rs?raw';
import commentsOld from './comments-old.rs?raw';
import diffViewerNew from './diff-viewer-new.tsx?raw';
import diffViewerOld from './diff-viewer-old.tsx?raw';
import readmeNew from './readme-new.md?raw';
import readmeOld from './readme-old.md?raw';
import settingsStoreNew from './settings-store-new.ts?raw';

function textContent(contents: string): FileContent {
  return { type: 'text', contents };
}

function binaryContent(size: number): FileContent {
  return { type: 'binary', size };
}

function makeDiffFile(name: string, content: FileContent | null, lang: string | null): DiffFile {
  return { name, content, lang };
}

function makeGitFileContents(
  oldName: string,
  oldContent: string | null,
  newName: string,
  newContent: string | null,
  lang: string | null
): GitFileContents {
  return {
    oldFile: makeDiffFile(oldName, oldContent !== null ? textContent(oldContent) : null, lang),
    newFile: makeDiffFile(newName, newContent !== null ? textContent(newContent) : null, lang)
  };
}

export const fileContentsMap: Record<string, GitFileContents> = {
  'src/features/diff-viewer/diff-viewer.tsx': makeGitFileContents(
    'diff-viewer.tsx',
    diffViewerOld,
    'diff-viewer.tsx',
    diffViewerNew,
    'tsx'
  ),

  'src/features/comments/comment-components.tsx': makeGitFileContents(
    'comment-components.tsx',
    `import { cn } from '#features/lib/utils';
import { Cancel01Icon, Loading02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Comment } from '../../../tauri-bindings';

import { Button } from '../components/ui/button';
import { formatRelativeTime } from './use-comments';

interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}

export function CommentForm({ onSubmit, onCancel }: CommentFormProps) {
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 my-3 mx-5">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment..."
        className="w-full min-h-[80px] bg-transparent text-sm resize-none"
      />
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSubmit()} disabled={!body.trim()}>
          {isSubmitting && (
            <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin mr-1.5" />
          )}
          Comment
        </Button>
      </div>
    </div>
  );
}

interface CommentDisplayProps {
  comment: Comment;
  onDelete?: (commentId: string) => Promise<void>;
}

export function CommentDisplay({ comment, onDelete }: CommentDisplayProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setIsDeleting(false);
    }
  }, [comment.id, onDelete, isDeleting]);

  return (
    <div className="group bg-card border border-border rounded-lg p-4 my-3 mx-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-foreground whitespace-pre-wrap break-words flex-1">
          {comment.body}
        </p>
        {onDelete && (
          <button
            onClick={() => void handleDelete()}
            disabled={isDeleting}
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'flex items-center justify-center h-6 w-6 rounded-md',
              'text-muted-foreground hover:text-destructive'
            )}
          >
            {isDeleting ? (
              <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
            ) : (
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            )}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-right">
        {formatRelativeTime(comment.createdAt)}
      </p>
    </div>
  );
}`,
    'comment-components.tsx',
    `import { cn } from '#features/lib/utils';
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading02Icon,
  PencilEdit01Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Comment } from '../../../tauri-bindings';

import { Button } from '../components/ui/button';
import { formatRelativeTime } from './use-comments';

interface CommentTextareaProps {
  initialValue?: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
}

function CommentTextarea({
  initialValue = '',
  onSubmit,
  onCancel,
  submitLabel = 'Comment',
  autoFocus = true
}: CommentTextareaProps) {
  const [body, setBody] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody('');
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  return (
    <>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment..."
        className="w-full min-h-[80px] bg-transparent text-sm resize-none"
      />
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSubmit()} disabled={!body.trim()}>
          {isSubmitting && (
            <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin mr-1.5" />
          )}
          {submitLabel}
        </Button>
      </div>
    </>
  );
}

interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}

export function CommentForm({ onSubmit, onCancel }: CommentFormProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 my-3 mx-5">
      <CommentTextarea onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}

interface CommentDisplayProps {
  comment: Comment;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
  onUpdate?: (comment: Comment) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
}

export function CommentDisplay({
  comment,
  isEditing = false,
  onStartEdit,
  onStopEdit,
  onUpdate,
  onDelete
}: CommentDisplayProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isEdited = comment.updatedAt !== comment.createdAt;
  const isOperationPending = isDeleting || isUpdating;

  const handleDeleteClick = useCallback(async () => {
    if (!onDelete || isOperationPending) return;

    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      setTimeout(() => setIsConfirmingDelete(false), 2000);
      return;
    }

    setIsConfirmingDelete(false);
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setIsDeleting(false);
    }
  }, [comment.id, onDelete, isConfirmingDelete, isOperationPending]);

  const handleResolveToggle = useCallback(async () => {
    if (!onUpdate || isOperationPending) return;

    setIsUpdating(true);
    try {
      await onUpdate({
        ...comment,
        resolved: !comment.resolved,
        updatedAt: Math.floor(Date.now() / 1000)
      });
    } finally {
      setIsUpdating(false);
    }
  }, [comment, onUpdate, isOperationPending]);

  const handleSaveEdit = useCallback(
    async (newBody: string) => {
      if (!onUpdate) return;

      setIsUpdating(true);
      try {
        await onUpdate({
          ...comment,
          body: newBody,
          updatedAt: Math.floor(Date.now() / 1000)
        });
        onStopEdit?.();
      } finally {
        setIsUpdating(false);
      }
    },
    [comment, onUpdate, onStopEdit]
  );

  return (
    <div
      className={cn(
        'group bg-card border rounded-lg p-4 my-3 mx-5 transition-colors',
        isEditing && 'ring-2 ring-primary/50',
        comment.resolved && 'border-l-2 border-l-git-added',
        comment.unanchored ? 'border-dashed border-git-modified/70' : 'border-border'
      )}
    >
      {isEditing ? (
        <CommentTextarea
          initialValue={comment.body}
          onSubmit={handleSaveEdit}
          onCancel={() => onStopEdit?.()}
          submitLabel="Save"
        />
      ) : (
        <>
          <p
            className={cn(
              'text-sm whitespace-pre-wrap break-words',
              comment.resolved ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {comment.body}
          </p>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(comment.createdAt)}
              {isEdited && <span className="ml-1">(edited)</span>}
              {comment.resolved && <span className="ml-1">(resolved)</span>}
            </p>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onUpdate && (
                <button
                  onClick={() => void handleResolveToggle()}
                  disabled={isOperationPending}
                  className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={comment.resolved ? CheckmarkCircle02Icon : Tick02Icon}
                    size={14}
                  />
                </button>
              )}

              {onStartEdit && (
                <button
                  onClick={onStartEdit}
                  disabled={isOperationPending}
                  className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={PencilEdit01Icon} size={14} />
                </button>
              )}

              {onDelete && (
                <button
                  onClick={() => void handleDeleteClick()}
                  disabled={isDeleting}
                  className={cn(
                    'flex items-center justify-center h-7 rounded-md px-1.5',
                    isConfirmingDelete
                      ? 'text-destructive bg-destructive/10'
                      : 'text-muted-foreground hover:text-destructive'
                  )}
                >
                  {isDeleting ? (
                    <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
                  ) : isConfirmingDelete ? (
                    <span className="text-xs font-medium">Delete?</span>
                  ) : (
                    <HugeiconsIcon icon={Cancel01Icon} size={14} />
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}`,
    'tsx'
  ),

  'src-tauri/src/comments.rs': makeGitFileContents(
    'comments.rs',
    commentsOld,
    'comments.rs',
    commentsNew,
    'rust'
  ),

  'src/lib/settings-store.ts': makeGitFileContents(
    'settings-store.ts',
    null,
    'settings-store.ts',
    settingsStoreNew,
    'typescript'
  ),

  'src/utils/old-helpers.ts': makeGitFileContents(
    'helpers.ts',
    `export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`,
    'old-helpers.ts',
    `export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateTime(date: Date): string {
  return \`\${formatDate(date)} at \${formatTime(date)}\`;
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}`,
    'typescript'
  ),

  'README.md': makeGitFileContents('README.md', readmeOld, 'README.md', readmeNew, 'markdown'),

  'src/app.tsx': makeGitFileContents(
    'app.tsx',
    `import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4">
      <h1>tinydiff</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}`,
    'app.tsx',
    `import { useCallback, useState } from 'react';

interface AppProps {
  initialCount?: number;
}

export function App({ initialCount = 0 }: AppProps) {
  const [count, setCount] = useState(initialCount);

  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount(c => Math.max(0, c - 1));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">tinydiff</h1>
      <div className="flex gap-2">
        <button
          onClick={decrement}
          className="px-3 py-1 bg-red-500 text-white rounded"
        >
          -
        </button>
        <span className="px-4 py-1">{count}</span>
        <button
          onClick={increment}
          className="px-3 py-1 bg-green-500 text-white rounded"
        >
          +
        </button>
      </div>
    </div>
  );
}`,
    'tsx'
  ),

  'src/styles/main.css': makeGitFileContents(
    'main.css',
    `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #000000;
}`,
    'main.css',
    `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --border: #e5e5e5;
  --primary: #2563eb;
  --primary-foreground: #ffffff;
}

.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --muted: #262626;
  --muted-foreground: #a3a3a3;
  --border: #262626;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
}

@layer base {
  body {
    @apply bg-background text-foreground;
  }
}`,
    'css'
  ),

  'package.json': makeGitFileContents(
    'package.json',
    `{
  "name": "tinydiff",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}`,
    'package.json',
    `{
  "name": "tinydiff",
  "version": "0.2.0",
  "scripts": {
    "dev": "vite",
    "dev:browser": "BROWSER_DEV=true vite",
    "build": "vite build",
    "validate": "tsc && eslint ."
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@pierre/diffs": "^1.0.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}`,
    'json'
  )
};

export const binaryFiles: Record<string, GitFileContents> = {
  'assets/logo.png': {
    oldFile: makeDiffFile('logo.png', binaryContent(15360), null),
    newFile: makeDiffFile('logo.png', binaryContent(18432), null)
  }
};

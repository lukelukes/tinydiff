import { cn } from '#features/lib/utils';
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

type CommentOperation =
  | { type: 'idle' }
  | { type: 'confirmingDelete' }
  | { type: 'deleting' }
  | { type: 'updating' };
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
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [onCancel, handleSubmit]
  );

  return (
    <>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment..."
        disabled={isSubmitting}
        className={cn(
          'w-full min-h-[80px] p-3',
          'bg-background border border-input rounded-md',
          'text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          'resize-none',
          'font-sans',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      />
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={!body.trim() || isSubmitting}
        >
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
    <div className="bg-card border border-border rounded-lg p-4 my-3 mx-5 shadow-subtle max-w-[min(100%,600px)]">
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
  const [operation, setOperation] = useState<CommentOperation>({ type: 'idle' });
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const isEdited = comment.updatedAt !== comment.createdAt;
  const isOperationPending = operation.type === 'deleting' || operation.type === 'updating';

  useEffect(() => {
    if (operation.type !== 'confirmingDelete') return;
    const timeout = setTimeout(() => {
      setOperation({ type: 'idle' });
    }, 2000);
    return () => {
      clearTimeout(timeout);
    };
  }, [operation.type]);

  const handleDeleteClick = useCallback(async () => {
    if (!onDelete || isOperationPending) return;
    if (operation.type !== 'confirmingDelete') {
      setOperation({ type: 'confirmingDelete' });
      return;
    }
    setOperation({ type: 'deleting' });
    try {
      await onDelete(comment.id);
    } catch {
      setOperation({ type: 'idle' });
    }
  }, [comment.id, onDelete, operation.type, isOperationPending]);

  const handleResolveToggle = useCallback(async () => {
    if (!onUpdate || isOperationPending) return;
    setOperation({ type: 'updating' });
    try {
      await onUpdate({
        ...comment,
        resolved: !comment.resolved,
        updatedAt: Math.floor(Date.now() / 1000)
      });
      setOperation({ type: 'idle' });
    } catch {
      setOperation({ type: 'idle' });
    }
  }, [comment, onUpdate, isOperationPending]);

  const handleSaveEdit = useCallback(
    async (newBody: string) => {
      if (!onUpdate) return;
      setOperation({ type: 'updating' });
      try {
        await onUpdate({
          ...comment,
          body: newBody,
          updatedAt: Math.floor(Date.now() / 1000)
        });
        setOperation({ type: 'idle' });
        onStopEdit?.();
      } catch {
        setOperation({ type: 'idle' });
      }
    },
    [comment, onUpdate, onStopEdit]
  );

  const handleCancelEdit = useCallback(() => {
    onStopEdit?.();
    setTimeout(() => {
      editButtonRef.current?.focus();
    }, 0);
  }, [onStopEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && operation.type === 'confirmingDelete') {
        e.preventDefault();
        setOperation({ type: 'idle' });
      }
    },
    [operation.type]
  );

  return (
    <div
      className={cn(
        'group bg-card border rounded-lg p-4 my-3 mx-5 shadow-subtle max-w-[min(100%,600px)] transition-colors',
        isEditing && 'ring-2 ring-primary/50',
        comment.resolved && 'border-l-2 border-l-git-added',
        comment.anchor.type === 'orphaned'
          ? 'border-dashed border-git-modified/70'
          : 'border-border'
      )}
      onKeyDown={handleKeyDown}
    >
      {isEditing ? (
        <CommentTextarea
          initialValue={comment.body}
          onSubmit={handleSaveEdit}
          onCancel={handleCancelEdit}
          submitLabel="Save"
        />
      ) : (
        <>
          {comment.anchor.type === 'orphaned' && (
            <div
              role="region"
              className="mb-3 text-xs font-mono bg-git-modified-bg rounded p-2"
              aria-label="Original code context where this comment was placed"
            >
              <p className="text-git-modified text-xs mb-1 font-sans">Original context:</p>
              <pre className="whitespace-pre-wrap break-words text-muted-foreground">
                {comment.anchor.context}
              </pre>
            </div>
          )}
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
              {comment.anchor.type === 'orphaned' && (
                <span className="ml-1 text-git-modified">(orphaned)</span>
              )}
            </p>

            <div
              className={cn(
                'flex items-center gap-1',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                (operation.type === 'confirmingDelete' || isOperationPending) && 'opacity-100'
              )}
            >
              {onUpdate && (
                <button
                  onClick={() => void handleResolveToggle()}
                  disabled={isOperationPending}
                  className={cn(
                    'flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-md',
                    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    comment.resolved && 'text-git-added'
                  )}
                  aria-label={comment.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                >
                  {operation.type === 'updating' ? (
                    <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon
                      icon={comment.resolved ? CheckmarkCircle02Icon : Tick02Icon}
                      size={14}
                    />
                  )}
                </button>
              )}

              {onStartEdit && (
                <button
                  ref={editButtonRef}
                  onClick={onStartEdit}
                  disabled={isOperationPending}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-md',
                    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  aria-label="Edit comment"
                >
                  <HugeiconsIcon icon={PencilEdit01Icon} size={14} />
                </button>
              )}

              {onDelete && (
                <button
                  onClick={() => void handleDeleteClick()}
                  onBlur={() => {
                    if (operation.type === 'confirmingDelete') setOperation({ type: 'idle' });
                  }}
                  disabled={operation.type === 'deleting'}
                  className={cn(
                    'flex items-center justify-center h-7 rounded-md px-1.5',
                    operation.type === 'confirmingDelete'
                      ? 'text-destructive bg-destructive/10'
                      : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  aria-label={
                    operation.type === 'confirmingDelete' ? 'Confirm delete' : 'Delete comment'
                  }
                >
                  {operation.type === 'deleting' ? (
                    <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
                  ) : operation.type === 'confirmingDelete' ? (
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
}

interface AddCommentButtonProps {
  onClick: () => void;
}

export function AddCommentButton({ onClick }: AddCommentButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'h-5 w-5 rounded-md',
        'bg-primary text-primary-foreground',
        'flex items-center justify-center',
        'cursor-pointer',
        'text-xs font-medium'
      )}
      aria-label="Add comment"
    >
      +
    </button>
  );
}

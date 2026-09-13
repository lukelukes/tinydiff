import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading02Icon,
  PencilEdit01Icon,
  Tick02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { cn } from '#features/lib/utils';

import type { Comment } from '../../../tauri-bindings';
import { Button } from '../components/ui/button';
import { useReview } from './review-context';
import { formatRelativeTime, type CommentSide } from './use-comments';

type CommentOperation =
  | { type: 'idle' }
  | { type: 'confirmingDelete' }
  | { type: 'deleting' }
  | { type: 'updating' };

interface CommentTextareaProps {
  initialValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  label?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

function CommentTextarea({
  initialValue = '',
  value,
  onValueChange,
  onSubmit,
  onCancel,
  label = 'Comment',
  submitLabel = 'Comment',
  autoFocus = true
}: CommentTextareaProps) {
  const id = useId();
  const [localBody, setLocalBody] = useState(initialValue);
  const body = value ?? localBody;
  const setBody = (next: string) => {
    setLocalBody(next);
    onValueChange?.(next);
  };
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
      <label htmlFor={id} className="mb-2 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Leave a comment..."
        disabled={isSubmitting}
        className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background p-3 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={!body.trim() || isSubmitting}
        >
          {isSubmitting && (
            <HugeiconsIcon icon={Loading02Icon} size={14} className="mr-1.5 animate-spin" />
          )}
          {submitLabel}
        </Button>
      </div>
    </>
  );
}

interface CommentFormProps {
  side: CommentSide;
  lineNumber: number;
  startLine?: number;
  draft: string;
}

export function CommentForm({ side, lineNumber, startLine, draft }: CommentFormProps) {
  const { submitComment, cancelComment, setDraft } = useReview();
  return (
    <div className="mx-5 my-3 max-w-[min(100%,600px)] rounded-lg border border-border bg-card p-4 shadow-subtle">
      <CommentTextarea
        value={draft}
        onValueChange={setDraft}
        onSubmit={(body) => submitComment(body, side, lineNumber, startLine)}
        onCancel={cancelComment}
      />
    </div>
  );
}

function CommentMeta({ comment }: { comment: Comment }) {
  const isEdited = comment.updatedAt !== comment.createdAt;
  return (
    <p className="text-xs text-muted-foreground">
      {formatRelativeTime(comment.createdAt)}
      {isEdited && <span className="ml-1">(edited)</span>}
      {comment.resolved && <span className="ml-1">(resolved)</span>}
      {comment.anchor.type === 'orphaned' && (
        <span className="ml-1 text-git-modified">(orphaned)</span>
      )}
    </p>
  );
}

function ResolveButton({
  resolved,
  isUpdating,
  disabled,
  onClick
}: {
  resolved: boolean;
  isUpdating: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5',
        'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        resolved && 'text-git-added'
      )}
      aria-label={resolved ? 'Mark as unresolved' : 'Mark as resolved'}
    >
      {isUpdating ? (
        <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
      ) : (
        <HugeiconsIcon icon={resolved ? CheckmarkCircle02Icon : Tick02Icon} size={14} />
      )}
    </button>
  );
}

function DeleteButton({
  operation,
  setOperation,
  onClick
}: {
  operation: CommentOperation;
  setOperation: (operation: CommentOperation) => void;
  onClick: () => void;
}) {
  const isConfirmingDelete = operation.type === 'confirmingDelete';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isConfirmingDelete) {
      e.preventDefault();
      setOperation({ type: 'idle' });
    }
  };

  const handleBlur = () => {
    if (isConfirmingDelete) setOperation({ type: 'idle' });
  };

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      disabled={operation.type === 'deleting'}
      className={cn(
        'flex h-7 items-center justify-center rounded-md px-1.5',
        isConfirmingDelete
          ? 'bg-destructive/10 text-destructive'
          : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
      aria-label={isConfirmingDelete ? 'Confirm delete' : 'Delete comment'}
    >
      {operation.type === 'deleting' ? (
        <HugeiconsIcon icon={Loading02Icon} size={14} className="animate-spin" />
      ) : isConfirmingDelete ? (
        <span className="text-xs font-medium">Delete?</span>
      ) : (
        <HugeiconsIcon icon={Cancel01Icon} size={14} />
      )}
    </button>
  );
}

interface CommentActionsProps {
  comment: Comment;
  operation: CommentOperation;
  setOperation: (operation: CommentOperation) => void;
  editButtonRef: React.RefObject<HTMLButtonElement | null>;
  onResolveToggle: () => void;
  onStartEdit: () => void;
  onDeleteClick: () => void;
}

function CommentActions({
  comment,
  operation,
  setOperation,
  editButtonRef,
  onResolveToggle,
  onStartEdit,
  onDeleteClick
}: CommentActionsProps) {
  const isOperationPending = operation.type === 'deleting' || operation.type === 'updating';
  const isVisible = operation.type === 'confirmingDelete' || isOperationPending;

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        'opacity-0 transition-opacity group-hover:opacity-100',
        isVisible && 'opacity-100'
      )}
    >
      <ResolveButton
        resolved={comment.resolved}
        isUpdating={operation.type === 'updating'}
        disabled={isOperationPending}
        onClick={onResolveToggle}
      />
      <button
        ref={editButtonRef}
        onClick={onStartEdit}
        disabled={isOperationPending}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Edit comment"
      >
        <HugeiconsIcon icon={PencilEdit01Icon} size={14} />
      </button>
      <DeleteButton operation={operation} setOperation={setOperation} onClick={onDeleteClick} />
    </div>
  );
}

interface CommentDisplayProps {
  comment: Comment;
  isEditing?: boolean;
  draft?: string;
}

export function CommentDisplay({ comment, isEditing = false, draft }: CommentDisplayProps) {
  const { updateComment, deleteComment, startEditing, stopEditing, setDraft } = useReview();
  const [operation, setOperation] = useState<CommentOperation>({ type: 'idle' });
  const editButtonRef = useRef<HTMLButtonElement>(null);

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
    if (isOperationPending) return;
    if (operation.type !== 'confirmingDelete') {
      setOperation({ type: 'confirmingDelete' });
      return;
    }
    setOperation({ type: 'deleting' });
    try {
      await deleteComment(comment.id);
    } catch {
      setOperation({ type: 'idle' });
    }
  }, [comment.id, deleteComment, operation.type, isOperationPending]);

  const handleResolveToggle = useCallback(async () => {
    if (isOperationPending) return;
    setOperation({ type: 'updating' });
    try {
      await updateComment({
        ...comment,
        resolved: !comment.resolved,
        updatedAt: Math.floor(Date.now() / 1000)
      });
      setOperation({ type: 'idle' });
    } catch {
      setOperation({ type: 'idle' });
    }
  }, [comment, updateComment, isOperationPending]);

  const handleSaveEdit = useCallback(
    async (newBody: string) => {
      setOperation({ type: 'updating' });
      try {
        await updateComment({
          ...comment,
          body: newBody,
          updatedAt: Math.floor(Date.now() / 1000)
        });
        setOperation({ type: 'idle' });
        stopEditing();
      } catch {
        setOperation({ type: 'idle' });
      }
    },
    [comment, updateComment, stopEditing]
  );

  const handleCancelEdit = useCallback(() => {
    stopEditing();
    setTimeout(() => {
      editButtonRef.current?.focus();
    }, 0);
  }, [stopEditing]);

  return (
    <div
      className={cn(
        'group mx-5 my-3 max-w-[min(100%,600px)] rounded-lg border bg-card p-4 shadow-subtle transition-colors',
        isEditing && 'ring-2 ring-primary/50',
        comment.resolved && 'border-l-2 border-l-git-added',
        comment.anchor.type === 'orphaned'
          ? 'border-dashed border-git-modified/70'
          : 'border-border'
      )}
    >
      {isEditing ? (
        <CommentTextarea
          initialValue={comment.body}
          value={draft}
          onValueChange={setDraft}
          onSubmit={handleSaveEdit}
          onCancel={handleCancelEdit}
          label="Edit comment"
          submitLabel="Save"
        />
      ) : (
        <>
          {comment.anchor.type === 'orphaned' && (
            <section
              className="mb-3 rounded bg-git-modified-bg p-2 font-mono text-xs"
              aria-label="Original code context where this comment was placed"
            >
              <p className="mb-1 font-sans text-xs text-git-modified">Original context:</p>
              <pre className="break-words whitespace-pre-wrap text-muted-foreground">
                {comment.anchor.context}
              </pre>
            </section>
          )}
          <p
            className={cn(
              'text-sm break-words whitespace-pre-wrap',
              comment.resolved ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {comment.body}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <CommentMeta comment={comment} />
            <CommentActions
              comment={comment}
              operation={operation}
              setOperation={setOperation}
              editButtonRef={editButtonRef}
              onResolveToggle={() => void handleResolveToggle()}
              onStartEdit={() => {
                startEditing(comment.id, comment.body);
              }}
              onDeleteClick={() => void handleDeleteClick()}
            />
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
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground"
      aria-label="Add comment"
    >
      +
    </button>
  );
}

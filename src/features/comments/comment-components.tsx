import { cn } from '#features/lib/utils';
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
    <div className="bg-card border border-border rounded-lg p-4 my-3 mx-5 shadow-subtle max-w-[min(100%,600px)]">
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
    <div className="group bg-card border border-border rounded-lg p-4 my-3 mx-5 shadow-subtle max-w-[min(100%,600px)]">
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
              'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Delete comment"
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

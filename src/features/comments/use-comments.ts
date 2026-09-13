import { useState, useEffect, useCallback } from 'react';

import type { Comment, CommentCollection, CommandError } from '#bindings/index';
import { commands } from '#bindings/index';

export type CommentSide = 'deletions' | 'additions';

export interface PendingComment {
  side: CommentSide;
  lineNumber: number;
  startLine?: number;
}

export type CommentFormState =
  | { type: 'closed' }
  | { type: 'pending'; comment: PendingComment; draft: string }
  | { type: 'editing'; commentId: string; draft: string };

type CommentsState =
  | { status: 'loading' }
  | { status: 'success'; data: CommentCollection }
  | { status: 'error'; error: CommandError };

export function useComments(repoPath: string) {
  const [state, setState] = useState<CommentsState>({ status: 'loading' });
  const [formState, setFormState] = useState<CommentFormState>({ type: 'closed' });
  const draft = formState.type === 'closed' ? null : formState.draft;

  const setDraft = useCallback((next: string) => {
    setFormState((prev) => (prev.type === 'closed' ? prev : { ...prev, draft: next }));
  }, []);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await commands.loadComments(repoPath);
    if (result.status === 'ok') {
      setState({ status: 'success', data: result.data });
    } else {
      setState({ status: 'error', error: result.error });
    }
  }, [repoPath]);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- data fetching pattern, setState is in async callback
    void refresh();
  }, [refresh]);

  const closeCommentForm = useCallback(() => {
    setFormState({ type: 'closed' });
  }, []);

  const saveComment = useCallback(
    async (comment: Comment, fileContents: string | null) => {
      const result = await commands.saveComment(repoPath, comment, fileContents);
      if (result.status === 'ok') {
        await refresh();
        return { success: true as const };
      }
      return { success: false as const, error: result.error };
    },
    [repoPath, refresh]
  );

  const updateComment = useCallback(
    async (comment: Comment, fileContents: string | null) => {
      const previousState = state;

      setState((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              data: {
                comments: prev.data.comments.map((c) => (c.id === comment.id ? comment : c))
              }
            }
          : prev
      );

      const result = await commands.saveComment(repoPath, comment, fileContents);
      if (result.status !== 'ok') {
        setState(previousState);
        return { success: false as const, error: result.error };
      }
      return { success: true as const };
    },
    [repoPath, state]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const result = await commands.deleteComment(repoPath, commentId);
      if (result.status === 'ok') {
        await refresh();
        return { success: true as const };
      }
      return { success: false as const, error: result.error };
    },
    [repoPath, refresh]
  );

  const openCommentForm = useCallback(
    (side: CommentSide, lineNumber: number, startLine?: number) => {
      setFormState({ type: 'pending', comment: { side, lineNumber, startLine }, draft: '' });
    },
    []
  );

  const startEditing = useCallback((id: string, body: string) => {
    setFormState({ type: 'editing', commentId: id, draft: body });
  }, []);

  const stopEditing = useCallback(() => {
    setFormState({ type: 'closed' });
  }, []);

  return {
    state,
    formState,
    draft,
    setDraft,
    refresh,
    saveComment,
    updateComment,
    deleteComment,
    openCommentForm,
    closeCommentForm,
    startEditing,
    stopEditing
  };
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks}w ago`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / YEAR);
  return `${years}y ago`;
}

export function generateCommentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

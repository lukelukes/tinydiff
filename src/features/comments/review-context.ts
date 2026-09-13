import { createContext, use } from 'react';

import type { Comment } from '../../../tauri-bindings';
import type { CommentSide } from './use-comments';

export interface ReviewActions {
  addComment: (side: CommentSide, lineNumber: number, startLine?: number) => void;
  submitComment: (
    body: string,
    side: CommentSide,
    lineNumber: number,
    startLine?: number
  ) => Promise<void>;
  cancelComment: () => void;
  updateComment: (comment: Comment) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  startEditing: (commentId: string, body: string) => void;
  stopEditing: () => void;
  setDraft: (draft: string) => void;
}

export const ReviewContext = createContext<ReviewActions | null>(null);

export function useReview() {
  const context = use(ReviewContext);
  if (!context) {
    throw new Error('useReview must be used within ReviewContext');
  }
  return context;
}

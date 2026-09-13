import type { AppMode, Comment, CommandError, CommentCollection, DiffTarget, FileDiff, GitFileContents, GitStatus, ReadFileResult, Result } from '../../src/bindings/types';

export declare function deleteComment(repoPath: string, commentId: string): Promise<Result<boolean, CommandError>>

export declare function getCommentsForFile(repoPath: string, filePath: string, fileContents: string): Promise<Result<Comment[], CommandError>>

export declare function getFileDiff(repoPath: string, filePath: string, target: DiffTarget): Promise<Result<FileDiff, CommandError>>

export declare function getGitFileContents(repoPath: string, filePath: string, target: DiffTarget): Promise<Result<GitFileContents, CommandError>>

export declare function getGitStatus(path: string): Promise<Result<GitStatus, CommandError>>

export declare function loadComments(repoPath: string): Promise<Result<CommentCollection, CommandError>>

export declare function readFile(filePath: string, allowed: Array<string>): Promise<Result<ReadFileResult, CommandError>>

export declare function resolveAppMode(paths: Array<string>): Result<AppMode, CommandError>

export declare function saveComment(repoPath: string, comment: Comment, fileContents: string | null): Promise<Result<null, CommandError>>

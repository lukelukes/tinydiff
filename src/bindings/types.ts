export type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

export type AppMode = { type: "empty" } | { type: "git"; path: string } | { type: "file"; fileA: string; fileB: string }

export type CommandError = { type: "path"; path: string; message: string } | { type: "utf8"; path: string } | { type: "git"; path: string; message: string }

export type Comment = { id: string; filePath: string; anchor: CommentAnchor; body: string; resolved: boolean; createdAt: number; updatedAt: number }

export type CommentAnchor = { type: "pinned"; line: number } | { type: "tracked"; line: number; context: string } | { type: "orphaned"; last_known_line: number; context: string }

export type CommentCollection = { comments: Comment[] }

export type DiffContent = { contentType: "text"; hunks: DiffHunk[] } | { contentType: "binary" }

export type DiffFile = { name: string; lang: string | null; content: FileContent | null }

export type DiffHunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; header: string; lines: DiffLine[] }

export type DiffLine = { changeType: LineChangeType; content: string; oldLineNo: number | null; newLineNo: number | null }

export type DiffTarget = "staged" | "unstaged"

export type FileContent = { type: "text"; contents: string } | { type: "binary"; size: number }

export type FileDiff = { path: string; oldPath: string | null; content: DiffContent }

export type FileEntry = { path: string; kind: FileEntryKind }

export type FileEntryKind = { status: "added" } | { status: "modified" } | { status: "deleted" } | { status: "renamed"; old_path: string } | { status: "untracked" } | { status: "typechange" } | { status: "conflicted" }

export type GitFileContents = { oldFile: DiffFile; newFile: DiffFile }

export type GitStatus = { staged: FileEntry[]; unstaged: FileEntry[]; untracked: FileEntry[] }

export type LineChangeType = "context" | "addition" | "deletion"

export type ReadFileResult = { name: string; contents: string; lang: string | null; isBinary: boolean }

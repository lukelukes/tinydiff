pub mod comments;
pub mod error;
pub mod fs;
pub mod git;
pub mod git_async;
pub mod types;

pub use comments::{
    delete_comment, get_comments_for_file, load_comments, re_anchor_comment, save_comment,
};
pub use error::CoreError;
pub use fs::{extension_to_lang, read_file};
pub use git::{
    discover_repository, get_file_diff, get_git_file_contents, get_status, open_repository,
};
pub use git_async::{get_file_diff_async, get_git_file_contents_async, get_status_async};
pub use types::{
    Comment, CommentCollection, DiffFile, DiffHunk, DiffLine, DiffTarget, FileContent, FileDiff,
    FileEntry, FileEntryKind, GitFileContents, GitStatus, LineChangeType, ReadFileResult,
};

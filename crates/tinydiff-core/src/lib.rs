pub mod commands;
pub mod comments;
pub mod error;
pub mod fs;
pub mod git;
pub mod types;

pub use comments::{
    delete_comment, get_comments_for_file, load_comments, re_anchor_comment, save_comment,
};
pub use error::CoreError;
pub use fs::{extension_to_lang, read_file};
pub use git::{
    discover_repository, get_file_diff, get_git_file_contents, get_status, open_repository,
};
pub use types::{
    Comment, CommentCollection, DiffFile, DiffHunk, DiffLine, DiffTarget, FileContent, FileDiff,
    FileEntry, FileEntryKind, GitFileContents, GitStatus, LineChangeType, ReadFileResult,
};

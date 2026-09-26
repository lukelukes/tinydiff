use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
#[cfg(feature = "specta")]
use specta::Type;
use thiserror::Error;

use crate::error::CoreError;
use crate::types::{
    Comment, CommentCollection, DiffTarget, FileDiff, GitFileContents, GitStatus, ReadFileResult,
};
use crate::{comments, fs, git};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(Type))]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AppMode {
    Empty,
    Git {
        path: String,
    },
    File {
        #[serde(rename = "fileA")]
        file_a: String,
        #[serde(rename = "fileB")]
        file_b: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Error)]
#[cfg_attr(feature = "specta", derive(Type))]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CommandError {
    #[error("{message}")]
    Path { path: String, message: String },
    #[serde(rename = "utf8")]
    #[error("path contains invalid UTF-8: {path}")]
    InvalidUtf8 { path: String },
    #[error("{message}")]
    Git { message: String },
    #[error("{message}")]
    Invalid { message: String },
}

impl From<CoreError> for CommandError {
    fn from(err: CoreError) -> Self {
        match &err {
            CoreError::Io { path, .. } => CommandError::Path {
                path: path.display().to_string(),
                message: err.to_string(),
            },
            CoreError::InvalidPath(message) => CommandError::Invalid {
                message: message.clone(),
            },
            CoreError::Git(_) | CoreError::TaskPanic(_) => CommandError::Git {
                message: err.to_string(),
            },
        }
    }
}

async fn blocking<T, F>(task: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CoreError> + Send + 'static,
{
    Ok(tokio::task::spawn_blocking(task)
        .await
        .map_err(CoreError::from)??)
}

fn canonicalize_path(path: &Path) -> Result<PathBuf, CommandError> {
    std::fs::canonicalize(path).map_err(|source| CommandError::Path {
        path: path.display().to_string(),
        message: format!("Cannot access path '{}': {source}", path.display()),
    })
}

fn path_to_string(path: &Path) -> Result<String, CommandError> {
    path.to_str()
        .map(String::from)
        .ok_or_else(|| CommandError::InvalidUtf8 {
            path: path.display().to_string(),
        })
}

fn existing_dir(repo_path: String) -> Result<PathBuf, CommandError> {
    let path = PathBuf::from(repo_path);
    if path.is_dir() {
        Ok(path)
    } else {
        Err(CommandError::Path {
            path: path.display().to_string(),
            message: "Path does not exist or is not a directory".to_owned(),
        })
    }
}

pub fn resolve_app_mode(paths: Vec<PathBuf>) -> Result<AppMode, CommandError> {
    let mut iter = paths.into_iter();
    match (iter.next(), iter.next(), iter.next()) {
        (None, _, _) => Ok(AppMode::Empty),
        (Some(p), None, _) => {
            let path = canonicalize_path(&p)?;
            git::discover_repository(&path)?;
            Ok(AppMode::Git {
                path: path_to_string(&path)?,
            })
        }
        (Some(a), Some(b), None) => Ok(AppMode::File {
            file_a: path_to_string(&canonicalize_path(&a)?)?,
            file_b: path_to_string(&canonicalize_path(&b)?)?,
        }),
        _ => Err(CommandError::Invalid {
            message: format!("Expected 0, 1, or 2 paths, got {}", iter.count() + 3),
        }),
    }
}

pub async fn get_git_status(path: String) -> Result<GitStatus, CommandError> {
    blocking(move || git::get_status(Path::new(&path))).await
}

pub async fn get_file_diff(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<FileDiff, CommandError> {
    blocking(move || git::get_file_diff(Path::new(&repo_path), &file_path, target)).await
}

pub async fn get_git_file_contents(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<GitFileContents, CommandError> {
    blocking(move || git::get_git_file_contents(Path::new(&repo_path), &file_path, target)).await
}

pub async fn read_file(mode: &AppMode, file_path: String) -> Result<ReadFileResult, CommandError> {
    let AppMode::File { file_a, file_b } = mode else {
        return Err(CommandError::Path {
            path: file_path,
            message: "read_file is only available in file comparison mode".to_owned(),
        });
    };
    if file_path != *file_a && file_path != *file_b {
        return Err(CommandError::Path {
            path: file_path,
            message: "Access denied: path not in allowed file list".to_owned(),
        });
    }
    blocking(move || fs::read_file(Path::new(&file_path))).await
}

pub async fn load_comments(repo_path: String) -> Result<CommentCollection, CommandError> {
    let repo_path = existing_dir(repo_path)?;
    blocking(move || comments::load_comments(&repo_path)).await
}

pub async fn save_comment(
    repo_path: String,
    comment: Comment,
    file_contents: Option<String>,
) -> Result<(), CommandError> {
    let repo_path = existing_dir(repo_path)?;
    blocking(move || comments::save_comment(&repo_path, comment, file_contents.as_deref())).await
}

pub async fn delete_comment(repo_path: String, comment_id: String) -> Result<bool, CommandError> {
    let repo_path = existing_dir(repo_path)?;
    blocking(move || comments::delete_comment(&repo_path, &comment_id)).await
}

pub async fn get_comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> Result<Vec<Comment>, CommandError> {
    let repo_path = existing_dir(repo_path)?;
    blocking(move || comments::get_comments_for_file(&repo_path, &file_path, &file_contents)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_with_file(name: &str, committed: &str, modified: &str) -> tempfile::TempDir {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let repo = git2::Repository::init(temp_dir.path()).unwrap();
        let file = temp_dir.path().join(name);
        std::fs::write(&file, committed).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        std::fs::write(&file, modified).unwrap();
        temp_dir
    }

    fn repo_path(temp_dir: &tempfile::TempDir) -> String {
        temp_dir.path().to_string_lossy().into_owned()
    }

    #[test]
    fn test_empty_args_returns_empty_mode() {
        assert_eq!(resolve_app_mode(vec![]), Ok(AppMode::Empty));
    }

    #[test]
    fn test_three_args_returns_invalid_argument() {
        let result = resolve_app_mode(vec![
            PathBuf::from("/a"),
            PathBuf::from("/b"),
            PathBuf::from("/c"),
        ]);
        assert_eq!(
            result,
            Err(CommandError::Invalid {
                message: "Expected 0, 1, or 2 paths, got 3".to_owned()
            })
        );
    }

    #[test]
    fn test_nonexistent_path_returns_path_error() {
        let result = resolve_app_mode(vec![PathBuf::from("/nonexistent/path/that/does/not/exist")]);
        assert!(matches!(result, Err(CommandError::Path { .. })));
    }

    #[test]
    fn test_two_nonexistent_paths_returns_path_error() {
        let result = resolve_app_mode(vec![
            PathBuf::from("/nonexistent/a"),
            PathBuf::from("/nonexistent/b"),
        ]);
        assert!(matches!(result, Err(CommandError::Path { .. })));
    }

    #[test]
    fn test_git_repository_returns_git_mode() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        git2::Repository::init(temp_dir.path()).unwrap();
        let result = resolve_app_mode(vec![temp_dir.path().to_path_buf()]);
        let canonical = std::fs::canonicalize(temp_dir.path()).unwrap();
        assert_eq!(
            result,
            Ok(AppMode::Git {
                path: canonical.to_string_lossy().into_owned()
            })
        );
    }

    #[test]
    fn test_directory_without_repository_returns_git_error() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let result = resolve_app_mode(vec![temp_dir.path().to_path_buf()]);
        assert!(matches!(result, Err(CommandError::Git { .. })));
    }

    #[tokio::test]
    async fn test_file_diff_accepts_names_containing_double_dots() {
        let temp_dir = repo_with_file("foo..bar.ts", "a\n", "b\n");
        let diff = get_file_diff(
            repo_path(&temp_dir),
            "foo..bar.ts".to_owned(),
            DiffTarget::Unstaged,
        )
        .await
        .unwrap();
        assert_eq!(diff.path, "foo..bar.ts");
    }

    #[tokio::test]
    async fn test_file_diff_rejects_parent_traversal() {
        let temp_dir = repo_with_file("a.ts", "a\n", "b\n");
        let result = get_file_diff(
            repo_path(&temp_dir),
            "../a.ts".to_owned(),
            DiffTarget::Unstaged,
        )
        .await;
        assert!(matches!(result, Err(CommandError::Invalid { .. })));
    }

    #[tokio::test]
    async fn test_git_file_contents_rejects_parent_traversal_for_staged_target() {
        let temp_dir = repo_with_file("a.ts", "a\n", "b\n");
        let result = get_git_file_contents(
            repo_path(&temp_dir),
            "../a.ts".to_owned(),
            DiffTarget::Staged,
        )
        .await;
        assert!(matches!(result, Err(CommandError::Invalid { .. })));
    }

    #[tokio::test]
    async fn test_git_status_runs_off_the_async_thread() {
        let temp_dir = repo_with_file("a.ts", "a\n", "b\n");
        let status = get_git_status(repo_path(&temp_dir)).await.unwrap();
        assert_eq!(status.unstaged.len(), 1);
    }

    #[tokio::test]
    async fn test_read_file_outside_file_mode_is_rejected() {
        let result = read_file(&AppMode::Empty, "/etc/hosts".to_owned()).await;
        assert!(matches!(result, Err(CommandError::Path { .. })));
    }

    #[tokio::test]
    async fn test_read_file_only_serves_the_compared_files() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let file_a = temp_dir.path().join("a.txt");
        let file_b = temp_dir.path().join("b.txt");
        std::fs::write(&file_a, "left").unwrap();
        std::fs::write(&file_b, "right").unwrap();
        let mode = AppMode::File {
            file_a: file_a.to_string_lossy().into_owned(),
            file_b: file_b.to_string_lossy().into_owned(),
        };

        let served = read_file(&mode, file_b.to_string_lossy().into_owned())
            .await
            .unwrap();
        assert_eq!(served.contents, "right");

        let denied = read_file(&mode, "/etc/hosts".to_owned()).await;
        assert!(matches!(denied, Err(CommandError::Path { .. })));
    }

    #[tokio::test]
    async fn test_comment_commands_reject_missing_repository() {
        let result = load_comments("/nonexistent/tinydiff".to_owned()).await;
        assert!(matches!(result, Err(CommandError::Path { .. })));
    }
}

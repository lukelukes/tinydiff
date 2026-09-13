use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
#[cfg(feature = "specta")]
use specta::Type;
use thiserror::Error;

use crate::error::CoreError;
use crate::git::discover_repository;

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
    Git { path: String, message: String },
}

impl From<CoreError> for CommandError {
    fn from(err: CoreError) -> Self {
        match &err {
            CoreError::Io { path, .. } => CommandError::Path {
                path: path.display().to_string(),
                message: err.to_string(),
            },
            CoreError::InvalidPath(msg) => CommandError::Path {
                path: String::new(),
                message: msg.clone(),
            },
            CoreError::Git(_) | CoreError::TaskPanic(_) => CommandError::Git {
                path: String::new(),
                message: err.to_string(),
            },
        }
    }
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

pub fn resolve_app_mode(paths: Vec<PathBuf>) -> Result<AppMode, CommandError> {
    let mut iter = paths.into_iter();
    match (iter.next(), iter.next(), iter.next()) {
        (None, _, _) => Ok(AppMode::Empty),
        (Some(p), None, _) => {
            let path = canonicalize_path(&p)?;
            let path = path_to_string(&path)?;
            discover_repository(Path::new(&path)).map_err(|e| CommandError::Git {
                path: path.clone(),
                message: e.to_string(),
            })?;
            Ok(AppMode::Git { path })
        }
        (Some(a), Some(b), None) => {
            let file_a = canonicalize_path(&a)?;
            let file_b = canonicalize_path(&b)?;
            Ok(AppMode::File {
                file_a: path_to_string(&file_a)?,
                file_b: path_to_string(&file_b)?,
            })
        }
        _ => Err(CommandError::Path {
            path: String::new(),
            message: format!("Expected 0, 1, or 2 paths, got {}", iter.count() + 3),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_args_returns_empty_mode() {
        let result = resolve_app_mode(vec![]);
        assert!(matches!(result, Ok(AppMode::Empty)));
    }

    #[test]
    fn test_three_args_returns_error() {
        let result = resolve_app_mode(vec![
            PathBuf::from("/a"),
            PathBuf::from("/b"),
            PathBuf::from("/c"),
        ]);
        assert!(matches!(
            result,
            Err(CommandError::Path { message, .. }) if message == "Expected 0, 1, or 2 paths, got 3"
        ));
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
}

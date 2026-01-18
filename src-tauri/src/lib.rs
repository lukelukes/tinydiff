pub mod comments;
pub mod fs;
pub mod git;

use clap::{CommandFactory, Parser, error::ErrorKind};
use comments::{Comment, CommentCollection};
use fs::ReadFileResult;
use git::{DiffTarget, FileDiff, GitFileContents, GitStatus};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Parser)]
#[command(
    name = "td",
    version,
    about = "A tiny diff viewer",
    after_help = "Examples:\n  td              Show welcome screen\n  td <path>       View git changes in repository\n  td <a> <b>      Compare two files"
)]
pub struct Args {
    /// Git repository path (1 arg) or two file paths to compare (2 args)
    #[arg(value_name = "PATH", num_args = 0..=2)]
    paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum AppMode {
    #[serde(rename = "empty")]
    Empty,
    #[serde(rename = "git")]
    Git { path: String },
    #[serde(rename = "file")]
    File {
        #[serde(rename = "fileA")]
        file_a: String,
        #[serde(rename = "fileB")]
        file_b: String,
    },
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Cannot access path '{}': {source}", .path.display())]
    PathError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Path contains invalid UTF-8: {}", .0.display())]
    InvalidUtf8(PathBuf),
    #[error("Git error for '{}': {source}", .path.display())]
    GitError {
        path: PathBuf,
        #[source]
        source: git2::Error,
    },
    #[error("Expected 0, 1, or 2 paths, got {0}")]
    InvalidArgCount(usize),
}

/// Serializable error type for Tauri commands.
/// Converts AppError variants to a format that can cross the IPC boundary.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type")]
pub enum CommandError {
    #[serde(rename = "path")]
    Path { path: String, message: String },
    #[serde(rename = "utf8")]
    InvalidUtf8 { path: String },
    #[serde(rename = "git")]
    Git { path: String, message: String },
}

impl From<AppError> for CommandError {
    fn from(err: AppError) -> Self {
        match err {
            AppError::PathError { path, source } => CommandError::Path {
                path: path.display().to_string(),
                message: source.to_string(),
            },
            AppError::InvalidUtf8(path) => CommandError::InvalidUtf8 {
                path: path.display().to_string(),
            },
            AppError::GitError { path, source } => CommandError::Git {
                path: path.display().to_string(),
                message: source.to_string(),
            },
            AppError::InvalidArgCount { .. } => CommandError::Path {
                path: String::new(),
                message: "Invalid argument count".to_string(),
            },
        }
    }
}

fn canonicalize_path(path: PathBuf) -> Result<PathBuf, AppError> {
    std::fs::canonicalize(&path).map_err(|source| AppError::PathError { path, source })
}

fn path_to_string(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(String::from)
        .ok_or_else(|| AppError::InvalidUtf8(path.to_owned()))
}

/// Parse app mode from CLI arguments.
/// This is a thin wrapper that calls `parse_app_mode_from_args` with parsed CLI args.
pub fn parse_app_mode() -> Result<AppMode, AppError> {
    parse_app_mode_from_args(Args::parse())
}

/// Parse app mode from pre-parsed arguments.
/// This function is testable since it doesn't depend on process arguments.
pub fn parse_app_mode_from_args(args: Args) -> Result<AppMode, AppError> {
    match args.paths.len() {
        0 => Ok(AppMode::Empty),
        1 => {
            let path = canonicalize_path(args.paths.into_iter().next().unwrap())?;
            git::discover_repository(&path).map_err(|source| AppError::GitError {
                path: path.clone(),
                source,
            })?;
            Ok(AppMode::Git {
                path: path_to_string(&path)?,
            })
        }
        2 => {
            let mut iter = args.paths.into_iter();
            let file_a = canonicalize_path(iter.next().unwrap())?;
            let file_b = canonicalize_path(iter.next().unwrap())?;
            Ok(AppMode::File {
                file_a: path_to_string(&file_a)?,
                file_b: path_to_string(&file_b)?,
            })
        }
        n => Err(AppError::InvalidArgCount(n)),
    }
}

#[tauri::command]
#[specta::specta]
fn get_app_mode(state: tauri::State<'_, AppMode>) -> AppMode {
    state.inner().clone()
}

#[tauri::command]
#[specta::specta]
fn get_git_status(path: String) -> Result<GitStatus, CommandError> {
    let path_buf = PathBuf::from(&path);
    let repo = git::discover_repository(&path_buf).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf.clone(),
            source,
        })
    })?;
    git::get_status(&repo).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn get_file_diff(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<FileDiff, CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    let repo = git::discover_repository(&path_buf).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf.clone(),
            source,
        })
    })?;

    // Validate file_path to prevent path traversal attacks
    if file_path.contains("..") || Path::new(&file_path).is_absolute() {
        return Err(CommandError::Git {
            path: file_path,
            message: "Invalid file path".to_string(),
        });
    }

    git::get_file_diff(&repo, &file_path, target).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn get_git_file_contents(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<GitFileContents, CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    let repo = git::discover_repository(&path_buf).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf.clone(),
            source,
        })
    })?;

    // Path validation is handled inside git::get_git_file_contents with proper canonicalization
    git::get_git_file_contents(&repo, &file_path, target).map_err(|source| {
        CommandError::from(AppError::GitError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn read_file(
    file_path: String,
    state: tauri::State<'_, AppMode>,
) -> Result<ReadFileResult, CommandError> {
    // Validate that the requested path is one of the allowed paths from AppMode::File
    let (allowed_a, allowed_b) = match state.inner() {
        AppMode::File { file_a, file_b } => (file_a.as_str(), file_b.as_str()),
        _ => {
            return Err(CommandError::Path {
                path: file_path,
                message: "read_file is only available in file comparison mode".to_string(),
            });
        }
    };

    if file_path != allowed_a && file_path != allowed_b {
        return Err(CommandError::Path {
            path: file_path,
            message: "Access denied: path not in allowed file list".to_string(),
        });
    }

    let path_buf = PathBuf::from(&file_path);

    fs::read_file(&path_buf).map_err(|source| {
        CommandError::from(AppError::PathError {
            path: path_buf,
            source,
        })
    })
}

fn validate_repo_path(repo_path: &Path) -> Result<(), CommandError> {
    if !repo_path.is_dir() {
        return Err(CommandError::Path {
            path: repo_path.display().to_string(),
            message: "Path does not exist or is not a directory".to_string(),
        });
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn load_comments(repo_path: String) -> Result<CommentCollection, CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    validate_repo_path(&path_buf)?;
    comments::load_comments(&path_buf).map_err(|source| {
        CommandError::from(AppError::PathError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn save_comment(
    repo_path: String,
    comment: Comment,
    file_contents: Option<String>,
) -> Result<(), CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    validate_repo_path(&path_buf)?;
    comments::save_comment(&path_buf, comment, file_contents.as_deref()).map_err(|source| {
        CommandError::from(AppError::PathError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn delete_comment(repo_path: String, comment_id: String) -> Result<bool, CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    validate_repo_path(&path_buf)?;
    comments::delete_comment(&path_buf, &comment_id).map_err(|source| {
        CommandError::from(AppError::PathError {
            path: path_buf,
            source,
        })
    })
}

#[tauri::command]
#[specta::specta]
fn get_comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> Result<Vec<Comment>, CommandError> {
    let path_buf = PathBuf::from(&repo_path);
    validate_repo_path(&path_buf)?;
    comments::get_comments_for_file(&path_buf, &file_path, &file_contents).map_err(|source| {
        CommandError::from(AppError::PathError {
            path: path_buf,
            source,
        })
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_mode = parse_app_mode().unwrap_or_else(|e| {
        let kind = match &e {
            AppError::PathError { .. } => ErrorKind::Io,
            AppError::InvalidUtf8(_) => ErrorKind::InvalidUtf8,
            AppError::GitError { .. } => ErrorKind::ValueValidation,
            AppError::InvalidArgCount(_) => ErrorKind::WrongNumberOfValues,
        };
        Args::command().error(kind, e).exit()
    });

    let builder =
        tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
            get_app_mode,
            get_git_status,
            get_file_diff,
            get_git_file_contents,
            read_file,
            load_comments,
            save_comment,
            delete_comment,
            get_comments_for_file
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number),
            "../tauri-bindings/index.ts",
        )
        .expect("Failed to export TypeScript bindings");

    tauri::Builder::default()
        .manage(app_mode)
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_args_returns_empty_mode() {
        let args = Args { paths: vec![] };
        let result = parse_app_mode_from_args(args);
        assert!(matches!(result, Ok(AppMode::Empty)));
    }

    #[test]
    fn test_three_args_returns_error() {
        let args = Args {
            paths: vec![
                PathBuf::from("/a"),
                PathBuf::from("/b"),
                PathBuf::from("/c"),
            ],
        };
        let result = parse_app_mode_from_args(args);
        assert!(matches!(result, Err(AppError::InvalidArgCount(3))));
    }

    #[test]
    fn test_nonexistent_path_returns_path_error() {
        let args = Args {
            paths: vec![PathBuf::from("/nonexistent/path/that/does/not/exist")],
        };
        let result = parse_app_mode_from_args(args);
        assert!(matches!(result, Err(AppError::PathError { .. })));
    }

    #[test]
    fn test_two_nonexistent_paths_returns_path_error() {
        let args = Args {
            paths: vec![
                PathBuf::from("/nonexistent/a"),
                PathBuf::from("/nonexistent/b"),
            ],
        };
        let result = parse_app_mode_from_args(args);
        assert!(matches!(result, Err(AppError::PathError { .. })));
    }
}

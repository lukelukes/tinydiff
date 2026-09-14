#![allow(unsafe_code)]

use std::path::{Path, PathBuf};

use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use tinydiff_core::app::{AppMode, CommandError};
use tinydiff_core::{
    Comment, CommentCollection, CoreError, DiffTarget, FileDiff, GitFileContents, GitStatus,
    ReadFileResult,
};

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum CommandResult<T> {
    Ok { data: T },
    Error { error: CommandError },
}

fn envelope<T: Serialize>(result: Result<T, CommandError>) -> Value {
    let wrapped = match result {
        Ok(data) => CommandResult::Ok { data },
        Err(error) => CommandResult::Error { error },
    };
    serde_json::to_value(wrapped).unwrap_or_else(|e| {
        serde_json::json!({
            "status": "error",
            "error": { "type": "path", "path": "", "message": e.to_string() }
        })
    })
}

fn parse<T: DeserializeOwned>(value: Value) -> Result<T, CommandError> {
    serde_json::from_value(value).map_err(|e| CommandError::Path {
        path: String::new(),
        message: format!("Invalid argument: {e}"),
    })
}

async fn blocking<T, F>(f: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CoreError> + Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(result) => result.map_err(CommandError::from),
        Err(e) => Err(CommandError::from(CoreError::from(e))),
    }
}

fn validate_file_path(file_path: &str) -> Result<(), CommandError> {
    if file_path.contains("..") || Path::new(file_path).is_absolute() {
        return Err(CommandError::Git {
            path: file_path.to_owned(),
            message: "Invalid file path".to_owned(),
        });
    }
    Ok(())
}

fn validate_repo_path(repo_path: &Path) -> Result<(), CommandError> {
    if !repo_path.is_dir() {
        return Err(CommandError::Path {
            path: repo_path.display().to_string(),
            message: "Path does not exist or is not a directory".to_owned(),
        });
    }
    Ok(())
}

#[napi(ts_return_type = "Result<AppMode, CommandError>")]
pub fn resolve_app_mode(paths: Vec<String>) -> Value {
    let paths = paths.into_iter().map(PathBuf::from).collect();
    envelope::<AppMode>(tinydiff_core::resolve_app_mode(paths))
}

#[napi(ts_return_type = "Promise<Result<GitStatus, CommandError>>")]
pub async fn get_git_status(path: String) -> Value {
    envelope::<GitStatus>(
        tinydiff_core::get_status_async(PathBuf::from(path))
            .await
            .map_err(CommandError::from),
    )
}

async fn file_diff(
    repo_path: String,
    file_path: String,
    target: Value,
) -> Result<FileDiff, CommandError> {
    validate_file_path(&file_path)?;
    let target: DiffTarget = parse(target)?;
    Ok(tinydiff_core::get_file_diff_async(PathBuf::from(repo_path), file_path, target).await?)
}

#[napi(
    ts_args_type = "repoPath: string, filePath: string, target: DiffTarget",
    ts_return_type = "Promise<Result<FileDiff, CommandError>>"
)]
pub async fn get_file_diff(repo_path: String, file_path: String, target: Value) -> Value {
    envelope(file_diff(repo_path, file_path, target).await)
}

async fn git_file_contents(
    repo_path: String,
    file_path: String,
    target: Value,
) -> Result<GitFileContents, CommandError> {
    let target: DiffTarget = parse(target)?;
    Ok(
        tinydiff_core::get_git_file_contents_async(PathBuf::from(repo_path), file_path, target)
            .await?,
    )
}

#[napi(
    ts_args_type = "repoPath: string, filePath: string, target: DiffTarget",
    ts_return_type = "Promise<Result<GitFileContents, CommandError>>"
)]
pub async fn get_git_file_contents(repo_path: String, file_path: String, target: Value) -> Value {
    envelope(git_file_contents(repo_path, file_path, target).await)
}

async fn read_file_checked(
    file_path: String,
    allowed: Vec<String>,
) -> Result<ReadFileResult, CommandError> {
    if allowed.is_empty() {
        return Err(CommandError::Path {
            path: file_path,
            message: "read_file is only available in file comparison mode".to_owned(),
        });
    }
    if !allowed.contains(&file_path) {
        return Err(CommandError::Path {
            path: file_path,
            message: "Access denied: path not in allowed file list".to_owned(),
        });
    }
    blocking(move || tinydiff_core::read_file(&PathBuf::from(file_path))).await
}

#[napi(ts_return_type = "Promise<Result<ReadFileResult, CommandError>>")]
pub async fn read_file(file_path: String, allowed: Vec<String>) -> Value {
    envelope(read_file_checked(file_path, allowed).await)
}

async fn comments(repo_path: String) -> Result<CommentCollection, CommandError> {
    let repo_path = PathBuf::from(repo_path);
    validate_repo_path(&repo_path)?;
    blocking(move || tinydiff_core::load_comments(&repo_path)).await
}

#[napi(ts_return_type = "Promise<Result<CommentCollection, CommandError>>")]
pub async fn load_comments(repo_path: String) -> Value {
    envelope(comments(repo_path).await)
}

async fn store_comment(
    repo_path: String,
    comment: Value,
    file_contents: Option<String>,
) -> Result<(), CommandError> {
    let repo_path = PathBuf::from(repo_path);
    validate_repo_path(&repo_path)?;
    let comment: Comment = parse(comment)?;
    blocking(move || tinydiff_core::save_comment(&repo_path, comment, file_contents.as_deref()))
        .await
}

#[napi(
    ts_args_type = "repoPath: string, comment: Comment, fileContents: string | null",
    ts_return_type = "Promise<Result<null, CommandError>>"
)]
pub async fn save_comment(
    repo_path: String,
    comment: Value,
    file_contents: Option<String>,
) -> Value {
    envelope(store_comment(repo_path, comment, file_contents).await)
}

async fn remove_comment(repo_path: String, comment_id: String) -> Result<bool, CommandError> {
    let repo_path = PathBuf::from(repo_path);
    validate_repo_path(&repo_path)?;
    blocking(move || tinydiff_core::delete_comment(&repo_path, &comment_id)).await
}

#[napi(ts_return_type = "Promise<Result<boolean, CommandError>>")]
pub async fn delete_comment(repo_path: String, comment_id: String) -> Value {
    envelope(remove_comment(repo_path, comment_id).await)
}

async fn comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> Result<Vec<Comment>, CommandError> {
    let repo_path = PathBuf::from(repo_path);
    validate_repo_path(&repo_path)?;
    blocking(move || tinydiff_core::get_comments_for_file(&repo_path, &file_path, &file_contents))
        .await
}

#[napi(ts_return_type = "Promise<Result<Comment[], CommandError>>")]
pub async fn get_comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> Value {
    envelope(comments_for_file(repo_path, file_path, file_contents).await)
}

#![allow(unsafe_code)]

use std::path::PathBuf;

use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use tinydiff_core::commands::{self, CommandError};

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum CommandResult<T> {
    Ok { data: T },
    Error { error: CommandError },
}

fn envelope<T: Serialize>(result: Result<T, CommandError>) -> napi::Result<Value> {
    let wrapped = match result {
        Ok(data) => CommandResult::Ok { data },
        Err(error) => CommandResult::Error { error },
    };
    serde_json::to_value(wrapped).map_err(|e| napi::Error::from_reason(e.to_string()))
}

fn parse<T: DeserializeOwned>(value: Value) -> Result<T, CommandError> {
    serde_json::from_value(value).map_err(|e| CommandError::Invalid {
        message: format!("Invalid argument: {e}"),
    })
}

#[napi(ts_return_type = "Result<AppMode, CommandError>")]
pub fn resolve_app_mode(paths: Vec<String>) -> napi::Result<Value> {
    envelope(commands::resolve_app_mode(
        paths.into_iter().map(PathBuf::from).collect(),
    ))
}

#[napi(ts_return_type = "Promise<Result<GitStatus, CommandError>>")]
pub async fn get_git_status(path: String) -> napi::Result<Value> {
    envelope(commands::get_git_status(path).await)
}

#[napi(
    ts_args_type = "repoPath: string, filePath: string, target: DiffTarget",
    ts_return_type = "Promise<Result<FileDiff, CommandError>>"
)]
pub async fn get_file_diff(
    repo_path: String,
    file_path: String,
    target: Value,
) -> napi::Result<Value> {
    envelope(async { commands::get_file_diff(repo_path, file_path, parse(target)?).await }.await)
}

#[napi(
    ts_args_type = "repoPath: string, filePath: string, target: DiffTarget",
    ts_return_type = "Promise<Result<GitFileContents, CommandError>>"
)]
pub async fn get_git_file_contents(
    repo_path: String,
    file_path: String,
    target: Value,
) -> napi::Result<Value> {
    envelope(
        async { commands::get_git_file_contents(repo_path, file_path, parse(target)?).await }.await,
    )
}

#[napi(
    ts_args_type = "mode: AppMode, filePath: string",
    ts_return_type = "Promise<Result<ReadFileResult, CommandError>>"
)]
pub async fn read_file(mode: Value, file_path: String) -> napi::Result<Value> {
    envelope(async { commands::read_file(&parse(mode)?, file_path).await }.await)
}

#[napi(ts_return_type = "Promise<Result<CommentCollection, CommandError>>")]
pub async fn load_comments(repo_path: String) -> napi::Result<Value> {
    envelope(commands::load_comments(repo_path).await)
}

#[napi(
    ts_args_type = "repoPath: string, comment: Comment, fileContents: string | null",
    ts_return_type = "Promise<Result<null, CommandError>>"
)]
pub async fn save_comment(
    repo_path: String,
    comment: Value,
    file_contents: Option<String>,
) -> napi::Result<Value> {
    envelope(
        async { commands::save_comment(repo_path, parse(comment)?, file_contents).await }.await,
    )
}

#[napi(ts_return_type = "Promise<Result<boolean, CommandError>>")]
pub async fn delete_comment(repo_path: String, comment_id: String) -> napi::Result<Value> {
    envelope(commands::delete_comment(repo_path, comment_id).await)
}

#[napi(ts_return_type = "Promise<Result<Comment[], CommandError>>")]
pub async fn get_comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> napi::Result<Value> {
    envelope(commands::get_comments_for_file(repo_path, file_path, file_contents).await)
}

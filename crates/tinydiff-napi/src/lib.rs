#![allow(unsafe_code)]

use std::path::PathBuf;

use napi_derive::napi;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use tinydiff_core::commands::{self, CommandError};
use tinydiff_core::types::DiffTarget;

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

fn argument<T>(decoded: serde_json::Result<T>) -> Result<T, CommandError> {
    decoded.map_err(|e| CommandError::Invalid {
        message: format!("Invalid argument: {e}"),
    })
}

fn json<T: DeserializeOwned>(text: &str) -> Result<T, CommandError> {
    argument(serde_json::from_str(text))
}

fn diff_target(target: String) -> Result<DiffTarget, CommandError> {
    argument(serde_json::from_value(Value::String(target)))
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
    target: String,
) -> napi::Result<Value> {
    envelope(
        async { commands::get_file_diff(repo_path, file_path, diff_target(target)?).await }.await,
    )
}

#[napi(
    ts_args_type = "repoPath: string, filePath: string, target: DiffTarget",
    ts_return_type = "Promise<Result<GitFileContents, CommandError>>"
)]
pub async fn get_git_file_contents(
    repo_path: String,
    file_path: String,
    target: String,
) -> napi::Result<Value> {
    envelope(
        async { commands::get_git_file_contents(repo_path, file_path, diff_target(target)?).await }
            .await,
    )
}

#[napi(
    ts_args_type = "modeJson: string, filePath: string",
    ts_return_type = "Promise<Result<ReadFileResult, CommandError>>"
)]
pub async fn read_file(mode_json: String, file_path: String) -> napi::Result<Value> {
    envelope(async { commands::read_file(&json(&mode_json)?, file_path).await }.await)
}

#[napi(ts_return_type = "Promise<Result<CommentCollection, CommandError>>")]
pub async fn load_comments(repo_path: String) -> napi::Result<Value> {
    envelope(commands::load_comments(repo_path).await)
}

#[napi(
    ts_args_type = "repoPath: string, commentJson: string, fileContents: string | null",
    ts_return_type = "Promise<Result<null, CommandError>>"
)]
pub async fn save_comment(
    repo_path: String,
    comment_json: String,
    file_contents: Option<String>,
) -> napi::Result<Value> {
    envelope(
        async { commands::save_comment(repo_path, json(&comment_json)?, file_contents).await }
            .await,
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

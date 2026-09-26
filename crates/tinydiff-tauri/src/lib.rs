#![allow(clippy::needless_pass_by_value)]

use clap::{CommandFactory, Parser, error::ErrorKind};
use std::path::PathBuf;
use tinydiff_core::commands::{self, AppMode, CommandError};
use tinydiff_core::{
    Comment, CommentCollection, DiffTarget, FileDiff, GitFileContents, GitStatus, ReadFileResult,
};

#[derive(Parser)]
#[command(
    name = "td",
    version,
    about = "A tiny diff viewer",
    after_help = "Examples:\n  td              Show welcome screen\n  td <path>       View git changes in repository\n  td <a> <b>      Compare two files"
)]
pub struct Args {
    #[arg(value_name = "PATH", num_args = 0..=2)]
    paths: Vec<PathBuf>,
}

#[tauri::command]
#[specta::specta]
fn get_app_mode(state: tauri::State<'_, AppMode>) -> AppMode {
    state.inner().clone()
}

#[tauri::command]
#[specta::specta]
async fn get_git_status(path: String) -> Result<GitStatus, CommandError> {
    commands::get_git_status(path).await
}

#[tauri::command]
#[specta::specta]
async fn get_file_diff(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<FileDiff, CommandError> {
    commands::get_file_diff(repo_path, file_path, target).await
}

#[tauri::command]
#[specta::specta]
async fn get_git_file_contents(
    repo_path: String,
    file_path: String,
    target: DiffTarget,
) -> Result<GitFileContents, CommandError> {
    commands::get_git_file_contents(repo_path, file_path, target).await
}

#[tauri::command]
#[specta::specta]
async fn read_file(
    file_path: String,
    state: tauri::State<'_, AppMode>,
) -> Result<ReadFileResult, CommandError> {
    commands::read_file(state.inner(), file_path).await
}

#[tauri::command]
#[specta::specta]
async fn load_comments(repo_path: String) -> Result<CommentCollection, CommandError> {
    commands::load_comments(repo_path).await
}

#[tauri::command]
#[specta::specta]
async fn save_comment(
    repo_path: String,
    comment: Comment,
    file_contents: Option<String>,
) -> Result<(), CommandError> {
    commands::save_comment(repo_path, comment, file_contents).await
}

#[tauri::command]
#[specta::specta]
async fn delete_comment(repo_path: String, comment_id: String) -> Result<bool, CommandError> {
    commands::delete_comment(repo_path, comment_id).await
}

#[tauri::command]
#[specta::specta]
async fn get_comments_for_file(
    repo_path: String,
    file_path: String,
    file_contents: String,
) -> Result<Vec<Comment>, CommandError> {
    commands::get_comments_for_file(repo_path, file_path, file_contents).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
pub fn run() {
    let app_mode = commands::resolve_app_mode(Args::parse().paths).unwrap_or_else(|e| {
        let kind = match &e {
            CommandError::Path { .. } => ErrorKind::Io,
            CommandError::InvalidUtf8 { .. } => ErrorKind::InvalidUtf8,
            CommandError::Git { .. } => ErrorKind::ValueValidation,
            CommandError::Invalid { .. } => ErrorKind::WrongNumberOfValues,
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

    tauri::Builder::default()
        .manage(app_mode)
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use crate::error::CoreError;
use crate::git;
use crate::types::{DiffTarget, FileDiff, GitFileContents, GitStatus};
use std::path::PathBuf;

pub async fn get_status_async(repo_path: PathBuf) -> Result<GitStatus, CoreError> {
    tokio::task::spawn_blocking(move || git::get_status(&repo_path)).await?
}

pub async fn get_file_diff_async(
    repo_path: PathBuf,
    file_path: String,
    target: DiffTarget,
) -> Result<FileDiff, CoreError> {
    tokio::task::spawn_blocking(move || git::get_file_diff(&repo_path, &file_path, target)).await?
}

pub async fn get_git_file_contents_async(
    repo_path: PathBuf,
    file_path: String,
    target: DiffTarget,
) -> Result<GitFileContents, CoreError> {
    tokio::task::spawn_blocking(move || git::get_git_file_contents(&repo_path, &file_path, target))
        .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Repository;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, Repository) {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path()).unwrap();

        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo)
    }

    #[tokio::test]
    async fn test_get_status_async() {
        let (temp_dir, _repo) = create_test_repo();

        fs::write(temp_dir.path().join("new_file.txt"), "content").unwrap();

        let status = get_status_async(temp_dir.path().to_path_buf()).await.unwrap();
        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "new_file.txt");
    }
}

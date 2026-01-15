use git2::{Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;

/// Opens a git repository at the given path.
/// Returns the repository if found, or an error if the path is not a git repo.
pub fn open_repository(path: &Path) -> Result<Repository, git2::Error> {
    Repository::open(path)
}

/// Discovers a git repository at or above the given path.
/// This walks up the directory tree to find a .git directory.
pub fn discover_repository(path: &Path) -> Result<Repository, git2::Error> {
    Repository::discover(path)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Typechange,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub status: FileStatus,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<FileEntry>,
}

fn status_to_file_status(status: Status, staged: bool) -> Option<FileStatus> {
    if staged {
        if status.contains(Status::INDEX_NEW) {
            Some(FileStatus::Added)
        } else if status.contains(Status::INDEX_MODIFIED) {
            Some(FileStatus::Modified)
        } else if status.contains(Status::INDEX_DELETED) {
            Some(FileStatus::Deleted)
        } else if status.contains(Status::INDEX_RENAMED) {
            Some(FileStatus::Renamed)
        } else if status.contains(Status::INDEX_TYPECHANGE) {
            Some(FileStatus::Typechange)
        } else {
            None
        }
    } else if status.contains(Status::WT_NEW) {
        Some(FileStatus::Untracked)
    } else if status.contains(Status::WT_MODIFIED) {
        Some(FileStatus::Modified)
    } else if status.contains(Status::WT_DELETED) {
        Some(FileStatus::Deleted)
    } else if status.contains(Status::WT_RENAMED) {
        Some(FileStatus::Renamed)
    } else if status.contains(Status::WT_TYPECHANGE) {
        Some(FileStatus::Typechange)
    } else if status.contains(Status::CONFLICTED) {
        Some(FileStatus::Conflicted)
    } else {
        None
    }
}

pub fn get_status(repo: &Repository) -> Result<GitStatus, git2::Error> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let default_path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        // Check staged (index) changes
        if let Some(file_status) = status_to_file_status(status, true) {
            let (path, old_path) = if status.contains(Status::INDEX_RENAMED) {
                let diff_delta = entry.head_to_index();
                let new_path = diff_delta
                    .as_ref()
                    .and_then(|d| d.new_file().path())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|| default_path.clone());
                let old = diff_delta
                    .and_then(|d| d.old_file().path())
                    .map(|p| p.to_string_lossy().into_owned());
                (new_path, old)
            } else {
                (default_path.clone(), None)
            };

            staged.push(FileEntry {
                path,
                status: file_status,
                old_path,
            });
        }

        // Check unstaged (working tree) changes
        if let Some(file_status) = status_to_file_status(status, false) {
            if file_status == FileStatus::Untracked {
                untracked.push(FileEntry {
                    path: default_path.clone(),
                    status: file_status,
                    old_path: None,
                });
            } else {
                let (path, old_path) = if status.contains(Status::WT_RENAMED) {
                    let diff_delta = entry.index_to_workdir();
                    let new_path = diff_delta
                        .as_ref()
                        .and_then(|d| d.new_file().path())
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or_else(|| default_path.clone());
                    let old = diff_delta
                        .and_then(|d| d.old_file().path())
                        .map(|p| p.to_string_lossy().into_owned());
                    (new_path, old)
                } else {
                    (default_path, None)
                };

                unstaged.push(FileEntry {
                    path,
                    status: file_status,
                    old_path,
                });
            }
        }
    }

    Ok(GitStatus {
        staged,
        unstaged,
        untracked,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::env;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, Repository) {
        let temp_dir = TempDir::new().unwrap();
        let repo = Repository::init(temp_dir.path()).unwrap();

        // Configure user for commits
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        (temp_dir, repo)
    }

    fn commit_file(repo: &Repository, path: &str, content: &str, message: &str) {
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join(path), content).unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new(path)).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = Signature::now("Test User", "test@example.com").unwrap();

        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();

        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap();
    }

    #[test]
    fn test_open_repository_current_dir() {
        // This test assumes we're running from within the tinydiff repo
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
        let repo_path = Path::new(&manifest_dir).parent().unwrap();

        let repo = open_repository(repo_path);
        assert!(
            repo.is_ok(),
            "Should be able to open the tinydiff repository"
        );

        let repo = repo.unwrap();
        assert!(!repo.is_bare(), "Repository should not be bare");
    }

    #[test]
    fn test_open_repository_not_a_repo() {
        let temp_dir = TempDir::new().unwrap();
        let result = open_repository(temp_dir.path());
        assert!(result.is_err(), "Should fail to open a non-git directory");
    }

    #[test]
    fn test_open_repository_new_init() {
        let temp_dir = TempDir::new().unwrap();
        Repository::init(temp_dir.path()).unwrap();

        let result = open_repository(temp_dir.path());
        assert!(result.is_ok(), "Should open a freshly initialized repo");
    }

    #[test]
    fn test_get_status_empty_repo() {
        let (_temp_dir, repo) = create_test_repo();

        let status = get_status(&repo).unwrap();
        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
        assert!(status.untracked.is_empty());
    }

    #[test]
    fn test_get_status_untracked_file() {
        let (temp_dir, repo) = create_test_repo();

        // Create an untracked file
        fs::write(temp_dir.path().join("new_file.txt"), "content").unwrap();

        let status = get_status(&repo).unwrap();
        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "new_file.txt");
        assert_eq!(status.untracked[0].status, FileStatus::Untracked);
    }

    #[test]
    fn test_get_status_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        // Create and stage a file (before any commits, it's INDEX_NEW)
        fs::write(temp_dir.path().join("staged.txt"), "content").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("staged.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(&repo).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "staged.txt");
        assert_eq!(status.staged[0].status, FileStatus::Added);
        assert!(status.unstaged.is_empty());
        assert!(status.untracked.is_empty());
    }

    #[test]
    fn test_get_status_staged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "initial", "Initial commit");

        // Modify and stage
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "modified").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(&repo).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "file.txt");
        assert_eq!(status.staged[0].status, FileStatus::Modified);
    }

    #[test]
    fn test_get_status_unstaged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "initial", "Initial commit");

        // Modify without staging
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "modified").unwrap();

        let status = get_status(&repo).unwrap();
        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "file.txt");
        assert_eq!(status.unstaged[0].status, FileStatus::Modified);
    }

    #[test]
    fn test_get_status_staged_deleted_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "content", "Initial commit");

        // Delete and stage
        let repo_path = repo.workdir().unwrap();
        fs::remove_file(repo_path.join("file.txt")).unwrap();
        let mut index = repo.index().unwrap();
        index.remove_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(&repo).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "file.txt");
        assert_eq!(status.staged[0].status, FileStatus::Deleted);
    }

    #[test]
    fn test_get_status_staged_renamed_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "old_name.txt", "content", "Initial commit");

        // Rename via index operations
        let repo_path = repo.workdir().unwrap();
        fs::rename(
            repo_path.join("old_name.txt"),
            repo_path.join("new_name.txt"),
        )
        .unwrap();

        let mut index = repo.index().unwrap();
        index.remove_path(Path::new("old_name.txt")).unwrap();
        index.add_path(Path::new("new_name.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(&repo).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "new_name.txt");
        assert_eq!(status.staged[0].status, FileStatus::Renamed);
        assert_eq!(status.staged[0].old_path, Some("old_name.txt".to_string()));
    }

    #[test]
    fn test_get_status_mixed_staged_and_unstaged() {
        let (temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "initial", "Initial commit");

        // Stage a modification
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "staged change").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        // Make another modification without staging
        fs::write(repo_path.join("file.txt"), "another change").unwrap();

        // Add an untracked file
        fs::write(temp_dir.path().join("untracked.txt"), "untracked").unwrap();

        let status = get_status(&repo).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].status, FileStatus::Modified);
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].status, FileStatus::Modified);
        assert_eq!(status.untracked.len(), 1);
    }

    #[test]
    fn test_get_status_unstaged_deleted_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "content", "Initial commit");

        // Delete the file from working tree WITHOUT staging
        let repo_path = repo.workdir().unwrap();
        fs::remove_file(repo_path.join("file.txt")).unwrap();

        let status = get_status(&repo).unwrap();
        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "file.txt");
        assert_eq!(status.unstaged[0].status, FileStatus::Deleted);
    }

    #[test]
    fn test_get_status_conflicted_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit on master/main
        commit_file(&repo, "conflict.txt", "initial content", "Initial commit");

        // Create and checkout a new branch
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head, false).unwrap();
        repo.set_head("refs/heads/feature").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        // Modify the file on the feature branch and commit
        commit_file(
            &repo,
            "conflict.txt",
            "feature branch content",
            "Feature commit",
        );

        // Go back to master/main
        repo.set_head("refs/heads/master").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        // Modify the same file differently on master and commit
        commit_file(
            &repo,
            "conflict.txt",
            "master branch content",
            "Master commit",
        );

        // Attempt to merge the feature branch (this will cause a conflict)
        let feature_branch = repo
            .find_branch("feature", git2::BranchType::Local)
            .unwrap();
        let feature_commit = feature_branch.get().peel_to_commit().unwrap();
        let annotated_commit = repo
            .find_annotated_commit(feature_commit.id())
            .unwrap();

        // Perform the merge (this will leave the repo in a conflicted state)
        repo.merge(&[&annotated_commit], None, None).unwrap();

        // Now check that the conflicted file shows up
        let status = get_status(&repo).unwrap();

        // The conflicted file should appear in unstaged with FileStatus::Conflicted
        let conflicted_files: Vec<_> = status
            .unstaged
            .iter()
            .filter(|f| f.status == FileStatus::Conflicted)
            .collect();

        assert_eq!(
            conflicted_files.len(),
            1,
            "Expected exactly one conflicted file"
        );
        assert_eq!(conflicted_files[0].path, "conflict.txt");
        assert_eq!(conflicted_files[0].status, FileStatus::Conflicted);
    }
}

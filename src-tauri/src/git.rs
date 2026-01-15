use crate::fs::extension_to_lang;
use git2::{DiffLineType, DiffOptions, Repository, Status, StatusOptions};
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

/// Type of change for a diff line
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum LineChangeType {
    Context,
    Addition,
    Deletion,
}

/// A single line in a diff
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub change_type: LineChangeType,
    pub content: String,
    pub old_line_no: Option<u32>,
    pub new_line_no: Option<u32>,
}

/// A hunk (section) of a diff
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// Complete diff for a single file
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub hunks: Vec<DiffHunk>,
    pub is_binary: bool,
}

/// Whether to get staged or unstaged changes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DiffTarget {
    Staged,
    Unstaged,
}

/// File contents for diff rendering
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    pub name: String,
    pub contents: String,
    pub lang: Option<String>,
}

/// Result of getting file contents for diff
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GitFileContents {
    pub old_file: FileContents,
    pub new_file: FileContents,
    pub is_binary: bool,
}

/// Get old and new file contents for diff rendering.
/// For staged: old from HEAD, new from index.
/// For unstaged: old from index, new from workdir.
pub fn get_git_file_contents(
    repo: &Repository,
    file_path: &str,
    target: DiffTarget,
) -> Result<GitFileContents, git2::Error> {
    // Validate file_path to prevent path traversal attacks
    let file_path_obj = Path::new(file_path);
    if file_path_obj.is_absolute() {
        return Err(git2::Error::from_str("Absolute paths are not allowed"));
    }

    // For unstaged diffs, validate that the resolved path stays within the workdir
    if target == DiffTarget::Unstaged {
        let workdir = repo
            .workdir()
            .ok_or_else(|| git2::Error::from_str("Repository has no working directory"))?;
        let full_path = workdir.join(file_path);
        // Canonicalize both paths and verify the file path is within workdir
        // Note: canonicalize requires the path to exist, so we canonicalize parent for new files
        let canonical_workdir = workdir.canonicalize().map_err(|e| {
            git2::Error::from_str(&format!("Failed to canonicalize workdir: {}", e))
        })?;
        // Try to canonicalize the full path, or its parent if file doesn't exist
        let canonical_full = if full_path.exists() {
            full_path.canonicalize()
        } else {
            // For non-existent files (e.g., deleted), canonicalize parent and append filename
            full_path
                .parent()
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No parent"))
                .and_then(|p| p.canonicalize())
                .map(|p| p.join(full_path.file_name().unwrap_or_default()))
        }
        .map_err(|e| git2::Error::from_str(&format!("Failed to canonicalize path: {}", e)))?;

        if !canonical_full.starts_with(&canonical_workdir) {
            return Err(git2::Error::from_str(
                "Path traversal detected: path escapes repository",
            ));
        }
    }

    let lang = extension_to_lang(file_path);

    // Get the blob content as a string, returning empty string for None (new/deleted files)
    // Uses null byte check for binary detection (consistent with workdir file handling)
    fn blob_to_string(blob: Option<git2::Blob>) -> (String, bool) {
        match blob {
            Some(b) => {
                let content = b.content();
                let is_binary = content.contains(&0);
                if is_binary {
                    (String::new(), true)
                } else {
                    (String::from_utf8_lossy(content).into_owned(), false)
                }
            }
            None => (String::new(), false),
        }
    }

    let (old_content, new_content, is_binary) = match target {
        DiffTarget::Staged => {
            // Old: content from HEAD commit
            let head_blob = repo
                .head()
                .ok()
                .and_then(|h| h.peel_to_tree().ok())
                .and_then(|tree| tree.get_path(Path::new(file_path)).ok())
                .and_then(|entry| entry.to_object(repo).ok())
                .and_then(|obj| obj.into_blob().ok());

            // New: content from index
            let index = repo.index()?;
            let index_blob = index
                .get_path(Path::new(file_path), 0)
                .and_then(|entry| repo.find_blob(entry.id).ok());

            let (old, is_binary_old) = blob_to_string(head_blob);
            let (new, is_binary_new) = blob_to_string(index_blob);
            (old, new, is_binary_old || is_binary_new)
        }
        DiffTarget::Unstaged => {
            // Old: content from index
            let index = repo.index()?;
            let index_blob = index
                .get_path(Path::new(file_path), 0)
                .and_then(|entry| repo.find_blob(entry.id).ok());

            // New: content from working directory
            // Note: workdir was already validated above during path traversal check
            let workdir = repo
                .workdir()
                .ok_or_else(|| git2::Error::from_str("Repository has no working directory"))?;
            let full_path = workdir.join(file_path);
            // Read file directly, handling NotFound as empty (deleted file)
            // This avoids TOCTOU race condition from exists() + read() pattern
            let workdir_content = match std::fs::read(&full_path) {
                Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
                Err(e) => {
                    return Err(git2::Error::from_str(&format!(
                        "Failed to read file: {}",
                        e
                    )));
                }
            };

            let (old, is_binary_old) = blob_to_string(index_blob);
            // Check if workdir content is binary (contains null bytes)
            let is_binary_new = workdir_content.contains('\0');
            let new = if is_binary_new {
                String::new()
            } else {
                workdir_content
            };

            (old, new, is_binary_old || is_binary_new)
        }
    };

    Ok(GitFileContents {
        old_file: FileContents {
            name: file_path.to_string(),
            contents: old_content,
            lang: lang.clone(),
        },
        new_file: FileContents {
            name: file_path.to_string(),
            contents: new_content,
            lang,
        },
        is_binary,
    })
}

/// Get the diff for a specific file
pub fn get_file_diff(
    repo: &Repository,
    file_path: &str,
    target: DiffTarget,
) -> Result<FileDiff, git2::Error> {
    use std::cell::RefCell;

    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);
    opts.context_lines(5);

    let diff = match target {
        DiffTarget::Staged => match repo.head().ok().and_then(|h| h.peel_to_tree().ok()) {
            Some(head) => repo.diff_tree_to_index(Some(&head), None, Some(&mut opts))?,
            None => repo.diff_tree_to_index(None, None, Some(&mut opts))?,
        },
        DiffTarget::Unstaged => {
            // For unstaged changes: diff index to workdir
            repo.diff_index_to_workdir(None, Some(&mut opts))?
        }
    };

    // Use RefCell to allow interior mutability in closures
    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let is_binary: RefCell<bool> = RefCell::new(false);
    let actual_path: RefCell<String> = RefCell::new(file_path.to_string());
    let old_path: RefCell<Option<String>> = RefCell::new(None);

    diff.print(git2::DiffFormat::Patch, |delta, hunk, line| {
        // Update file info from delta
        if let Some(p) = delta.new_file().path() {
            *actual_path.borrow_mut() = p.to_string_lossy().into_owned();
        }
        if let Some(p) = delta.old_file().path() {
            let old = p.to_string_lossy().into_owned();
            let current_path = actual_path.borrow();
            if old != *current_path {
                *old_path.borrow_mut() = Some(old);
            }
        }

        // Check if binary
        if delta.flags().is_binary() {
            *is_binary.borrow_mut() = true;
        }

        // Process hunk header
        if let Some(h) = hunk {
            let mut hunks_ref = hunks.borrow_mut();
            // Check if we need to add a new hunk (compare with last hunk's header info)
            let needs_new_hunk = hunks_ref
                .last()
                .map(|last| {
                    last.old_start != h.old_start()
                        || last.new_start != h.new_start()
                        || last.old_lines != h.old_lines()
                        || last.new_lines != h.new_lines()
                })
                .unwrap_or(true);

            if needs_new_hunk {
                hunks_ref.push(DiffHunk {
                    old_start: h.old_start(),
                    old_lines: h.old_lines(),
                    new_start: h.new_start(),
                    new_lines: h.new_lines(),
                    header: String::from_utf8_lossy(h.header()).trim_end().to_string(),
                    lines: Vec::new(),
                });
            }
        }

        // Process line
        let change_type = match line.origin_value() {
            DiffLineType::Addition => LineChangeType::Addition,
            DiffLineType::Deletion => LineChangeType::Deletion,
            DiffLineType::Context => LineChangeType::Context,
            DiffLineType::ContextEOFNL | DiffLineType::AddEOFNL | DiffLineType::DeleteEOFNL => {
                // Handle EOF newline markers as context
                LineChangeType::Context
            }
            _ => return true, // Skip headers, binary markers, etc.
        };

        let content = String::from_utf8_lossy(line.content())
            .trim_end_matches('\n')
            .to_string();

        let mut hunks_ref = hunks.borrow_mut();
        if let Some(hunk) = hunks_ref.last_mut() {
            hunk.lines.push(DiffLine {
                change_type,
                content,
                old_line_no: line.old_lineno(),
                new_line_no: line.new_lineno(),
            });
        }

        true
    })?;

    Ok(FileDiff {
        path: actual_path.into_inner(),
        old_path: old_path.into_inner(),
        hunks: hunks.into_inner(),
        is_binary: is_binary.into_inner(),
    })
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
        let annotated_commit = repo.find_annotated_commit(feature_commit.id()).unwrap();

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

    #[test]
    fn test_get_file_diff_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        // Create initial commit to establish HEAD
        commit_file(&repo, "existing.txt", "existing", "Initial commit");

        // Stage a new file
        fs::write(temp_dir.path().join("new.txt"), "line 1\nline 2\nline 3\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new.txt")).unwrap();
        index.write().unwrap();

        let diff = get_file_diff(&repo, "new.txt", DiffTarget::Staged).unwrap();
        assert_eq!(diff.path, "new.txt");
        assert!(!diff.is_binary);
        assert_eq!(diff.hunks.len(), 1);

        let hunk = &diff.hunks[0];
        assert_eq!(hunk.old_start, 0);
        assert_eq!(hunk.new_start, 1);
        assert_eq!(hunk.lines.len(), 3);
        assert!(
            hunk.lines
                .iter()
                .all(|l| l.change_type == LineChangeType::Addition)
        );
    }

    #[test]
    fn test_get_file_diff_staged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "line 1\nline 2\nline 3\n", "Initial");

        // Modify and stage
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "line 1\nMODIFIED\nline 3\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        let diff = get_file_diff(&repo, "file.txt", DiffTarget::Staged).unwrap();
        assert_eq!(diff.path, "file.txt");
        assert!(!diff.is_binary);
        assert_eq!(diff.hunks.len(), 1);

        let hunk = &diff.hunks[0];
        // Should have context, deletion, addition, context
        let deletions: Vec<_> = hunk
            .lines
            .iter()
            .filter(|l| l.change_type == LineChangeType::Deletion)
            .collect();
        let additions: Vec<_> = hunk
            .lines
            .iter()
            .filter(|l| l.change_type == LineChangeType::Addition)
            .collect();

        assert_eq!(deletions.len(), 1);
        assert_eq!(additions.len(), 1);
        assert!(deletions[0].content.contains("line 2"));
        assert!(additions[0].content.contains("MODIFIED"));
    }

    #[test]
    fn test_get_file_diff_unstaged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        commit_file(&repo, "file.txt", "line 1\nline 2\nline 3\n", "Initial");

        // Modify without staging
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "line 1\nCHANGED\nline 3\n").unwrap();

        let diff = get_file_diff(&repo, "file.txt", DiffTarget::Unstaged).unwrap();
        assert_eq!(diff.path, "file.txt");
        assert_eq!(diff.hunks.len(), 1);

        let hunk = &diff.hunks[0];
        let deletions: Vec<_> = hunk
            .lines
            .iter()
            .filter(|l| l.change_type == LineChangeType::Deletion)
            .collect();
        let additions: Vec<_> = hunk
            .lines
            .iter()
            .filter(|l| l.change_type == LineChangeType::Addition)
            .collect();

        assert_eq!(deletions.len(), 1);
        assert_eq!(additions.len(), 1);
        assert!(deletions[0].content.contains("line 2"));
        assert!(additions[0].content.contains("CHANGED"));
    }

    #[test]
    fn test_get_file_diff_line_numbers() {
        let (_temp_dir, repo) = create_test_repo();

        // Create file with multiple lines
        commit_file(
            &repo,
            "file.txt",
            "line 1\nline 2\nline 3\nline 4\nline 5\n",
            "Initial",
        );

        // Modify line 3
        let repo_path = repo.workdir().unwrap();
        fs::write(
            repo_path.join("file.txt"),
            "line 1\nline 2\nMODIFIED 3\nline 4\nline 5\n",
        )
        .unwrap();

        let diff = get_file_diff(&repo, "file.txt", DiffTarget::Unstaged).unwrap();
        let hunk = &diff.hunks[0];

        // Verify line numbers are present
        for line in &hunk.lines {
            match line.change_type {
                LineChangeType::Context => {
                    assert!(line.old_line_no.is_some());
                    assert!(line.new_line_no.is_some());
                }
                LineChangeType::Deletion => {
                    assert!(line.old_line_no.is_some());
                    assert!(line.new_line_no.is_none());
                }
                LineChangeType::Addition => {
                    assert!(line.old_line_no.is_none());
                    assert!(line.new_line_no.is_some());
                }
            }
        }
    }

    #[test]
    fn test_get_file_diff_multiple_hunks() {
        let (_temp_dir, repo) = create_test_repo();

        // Create file with many lines so changes at start and end create separate hunks
        let original: String = (1..=20).map(|i| format!("line {}\n", i)).collect();
        commit_file(&repo, "file.txt", &original, "Initial");

        // Modify first and last lines (with 5 context lines, these should be separate hunks)
        let mut modified: String = (1..=20).map(|i| format!("line {}\n", i)).collect();
        modified = modified.replace("line 1\n", "CHANGED 1\n");
        modified = modified.replace("line 20\n", "CHANGED 20\n");

        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), &modified).unwrap();

        let diff = get_file_diff(&repo, "file.txt", DiffTarget::Unstaged).unwrap();

        // With 20 lines and changes at 1 and 20, and 5 lines of context,
        // we should get 2 separate hunks (lines 1-6 and lines 15-20)
        assert_eq!(diff.hunks.len(), 2, "Expected 2 hunks for distant changes");
    }

    #[test]
    fn test_get_git_file_contents_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        // Create initial commit to establish HEAD
        commit_file(&repo, "existing.txt", "existing", "Initial commit");

        // Stage a new file
        let new_content = "line 1\nline 2\nline 3\n";
        fs::write(temp_dir.path().join("new.ts"), new_content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new.ts")).unwrap();
        index.write().unwrap();

        let contents = get_git_file_contents(&repo, "new.ts", DiffTarget::Staged).unwrap();

        // Old content should be empty (new file)
        assert!(contents.old_file.contents.is_empty());
        assert_eq!(contents.new_file.contents, new_content);
        assert_eq!(contents.old_file.lang, Some("typescript".to_string()));
        assert_eq!(contents.new_file.lang, Some("typescript".to_string()));
        assert!(!contents.is_binary);
    }

    #[test]
    fn test_get_git_file_contents_staged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        let original = "line 1\nline 2\nline 3\n";
        commit_file(&repo, "file.rs", original, "Initial");

        // Modify and stage
        let modified = "line 1\nMODIFIED\nline 3\n";
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.rs"), modified).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.rs")).unwrap();
        index.write().unwrap();

        let contents = get_git_file_contents(&repo, "file.rs", DiffTarget::Staged).unwrap();

        assert_eq!(contents.old_file.contents, original);
        assert_eq!(contents.new_file.contents, modified);
        assert_eq!(contents.old_file.lang, Some("rust".to_string()));
        assert!(!contents.is_binary);
    }

    #[test]
    fn test_get_git_file_contents_unstaged_modified_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        let original = "line 1\nline 2\nline 3\n";
        commit_file(&repo, "file.py", original, "Initial");

        // Modify without staging
        let modified = "line 1\nCHANGED\nline 3\n";
        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.py"), modified).unwrap();

        let contents = get_git_file_contents(&repo, "file.py", DiffTarget::Unstaged).unwrap();

        // For unstaged: old is from index (same as HEAD after commit), new is from workdir
        assert_eq!(contents.old_file.contents, original);
        assert_eq!(contents.new_file.contents, modified);
        assert_eq!(contents.old_file.lang, Some("python".to_string()));
        assert!(!contents.is_binary);
    }

    #[test]
    fn test_get_git_file_contents_deleted_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        let original = "content\n";
        commit_file(&repo, "file.txt", original, "Initial");

        // Delete the file from working tree (unstaged delete)
        let repo_path = repo.workdir().unwrap();
        fs::remove_file(repo_path.join("file.txt")).unwrap();

        let contents = get_git_file_contents(&repo, "file.txt", DiffTarget::Unstaged).unwrap();

        assert_eq!(contents.old_file.contents, original);
        assert!(contents.new_file.contents.is_empty()); // File deleted
        assert!(!contents.is_binary);
    }

    #[test]
    fn test_get_git_file_contents_staged_deleted_file() {
        let (_temp_dir, repo) = create_test_repo();

        // Create initial commit
        let original = "content\n";
        commit_file(&repo, "file.txt", original, "Initial");

        // Delete and stage
        let repo_path = repo.workdir().unwrap();
        fs::remove_file(repo_path.join("file.txt")).unwrap();
        let mut index = repo.index().unwrap();
        index.remove_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        let contents = get_git_file_contents(&repo, "file.txt", DiffTarget::Staged).unwrap();

        assert_eq!(contents.old_file.contents, original);
        assert!(contents.new_file.contents.is_empty()); // Not in index anymore
        assert!(!contents.is_binary);
    }
}

use crate::error::CoreError;
use crate::fs::extension_to_lang;
use crate::types::{
    DiffFile, DiffHunk, DiffLine, DiffTarget, FileContent, FileDiff, FileEntry, FileStatus,
    GitFileContents, GitStatus, LineChangeType,
};
use git2::{DiffLineType, DiffOptions, Repository, Status, StatusOptions};
use std::path::Path;

pub fn open_repository(path: &Path) -> Result<Repository, CoreError> {
    Repository::open(path).map_err(CoreError::from)
}

pub fn discover_repository(path: &Path) -> Result<Repository, CoreError> {
    Repository::discover(path).map_err(CoreError::from)
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

fn blob_to_content(blob: Option<git2::Blob>) -> Option<FileContent> {
    blob.map(|b| {
        let content = b.content();
        if content.contains(&0) {
            FileContent::Binary {
                size: content.len() as u64,
            }
        } else {
            FileContent::Text {
                contents: String::from_utf8_lossy(content).into_owned(),
            }
        }
    })
}

fn bytes_to_content(bytes: &[u8]) -> FileContent {
    if bytes.contains(&0) {
        FileContent::Binary {
            size: bytes.len() as u64,
        }
    } else {
        FileContent::Text {
            contents: String::from_utf8_lossy(bytes).into_owned(),
        }
    }
}

pub fn get_status(repo_path: &Path) -> Result<GitStatus, CoreError> {
    let repo = discover_repository(repo_path)?;
    get_status_with_repo(&repo)
}

fn get_status_with_repo(repo: &Repository) -> Result<GitStatus, CoreError> {
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

pub fn get_file_diff(
    repo_path: &Path,
    file_path: &str,
    target: DiffTarget,
) -> Result<FileDiff, CoreError> {
    let repo = discover_repository(repo_path)?;
    get_file_diff_with_repo(&repo, file_path, target)
}

fn get_file_diff_with_repo(
    repo: &Repository,
    file_path: &str,
    target: DiffTarget,
) -> Result<FileDiff, CoreError> {
    use std::cell::RefCell;

    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);
    opts.context_lines(5);

    let diff = match target {
        DiffTarget::Staged => match repo.head().ok().and_then(|h| h.peel_to_tree().ok()) {
            Some(head) => repo.diff_tree_to_index(Some(&head), None, Some(&mut opts))?,
            None => repo.diff_tree_to_index(None, None, Some(&mut opts))?,
        },
        DiffTarget::Unstaged => repo.diff_index_to_workdir(None, Some(&mut opts))?,
    };

    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let is_binary: RefCell<bool> = RefCell::new(false);
    let actual_path: RefCell<String> = RefCell::new(file_path.to_string());
    let old_path: RefCell<Option<String>> = RefCell::new(None);

    diff.print(git2::DiffFormat::Patch, |delta, hunk, line| {
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

        if delta.flags().is_binary() {
            *is_binary.borrow_mut() = true;
        }

        if let Some(h) = hunk {
            let mut hunks_ref = hunks.borrow_mut();
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

        let change_type = match line.origin_value() {
            DiffLineType::Addition => LineChangeType::Addition,
            DiffLineType::Deletion => LineChangeType::Deletion,
            DiffLineType::Context => LineChangeType::Context,
            DiffLineType::ContextEOFNL | DiffLineType::AddEOFNL | DiffLineType::DeleteEOFNL => {
                LineChangeType::Context
            }
            _ => return true,
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

pub fn get_git_file_contents(
    repo_path: &Path,
    file_path: &str,
    target: DiffTarget,
) -> Result<GitFileContents, CoreError> {
    let repo = discover_repository(repo_path)?;
    get_git_file_contents_with_repo(&repo, file_path, target)
}

fn get_git_file_contents_with_repo(
    repo: &Repository,
    file_path: &str,
    target: DiffTarget,
) -> Result<GitFileContents, CoreError> {
    let file_path_obj = Path::new(file_path);
    if file_path_obj.is_absolute() {
        return Err(CoreError::InvalidPath(
            "Absolute paths are not allowed".to_string(),
        ));
    }

    if target == DiffTarget::Unstaged {
        let workdir = repo
            .workdir()
            .ok_or_else(|| CoreError::InvalidPath("Repository has no working directory".into()))?;
        let full_path = workdir.join(file_path);
        let canonical_workdir = workdir
            .canonicalize()
            .map_err(|e| CoreError::io(workdir, e))?;
        let canonical_full = if full_path.exists() {
            full_path.canonicalize()
        } else {
            full_path
                .parent()
                .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No parent"))
                .and_then(|p| p.canonicalize())
                .map(|p| p.join(full_path.file_name().unwrap_or_default()))
        }
        .map_err(|e| CoreError::io(&full_path, e))?;

        if !canonical_full.starts_with(&canonical_workdir) {
            return Err(CoreError::InvalidPath(
                "Path traversal detected: path escapes repository".into(),
            ));
        }
    }

    let lang = extension_to_lang(file_path);

    let (old_content, new_content) = match target {
        DiffTarget::Staged => {
            let head_blob = repo
                .head()
                .ok()
                .and_then(|h| h.peel_to_tree().ok())
                .and_then(|tree| tree.get_path(Path::new(file_path)).ok())
                .and_then(|entry| entry.to_object(repo).ok())
                .and_then(|obj| obj.into_blob().ok());

            let index = repo.index()?;
            let index_blob = index
                .get_path(Path::new(file_path), 0)
                .and_then(|entry| repo.find_blob(entry.id).ok());

            (blob_to_content(head_blob), blob_to_content(index_blob))
        }
        DiffTarget::Unstaged => {
            let index = repo.index()?;
            let index_blob = index
                .get_path(Path::new(file_path), 0)
                .and_then(|entry| repo.find_blob(entry.id).ok());

            let workdir = repo
                .workdir()
                .ok_or_else(|| CoreError::InvalidPath("Repository has no working directory".into()))?;
            let full_path = workdir.join(file_path);
            let workdir_content = match std::fs::read(&full_path) {
                Ok(bytes) => Some(bytes_to_content(&bytes)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => {
                    return Err(CoreError::io(&full_path, e));
                }
            };

            (blob_to_content(index_blob), workdir_content)
        }
    };

    Ok(GitFileContents {
        old_file: DiffFile {
            name: file_path.to_string(),
            lang: lang.clone(),
            content: old_content,
        },
        new_file: DiffFile {
            name: file_path.to_string(),
            lang,
            content: new_content,
        },
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
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
        let repo_path = Path::new(&manifest_dir).parent().unwrap().parent().unwrap();

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
        let (temp_dir, _repo) = create_test_repo();

        let status = get_status(temp_dir.path()).unwrap();
        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
        assert!(status.untracked.is_empty());
    }

    #[test]
    fn test_get_status_untracked_file() {
        let (temp_dir, _repo) = create_test_repo();

        fs::write(temp_dir.path().join("new_file.txt"), "content").unwrap();

        let status = get_status(temp_dir.path()).unwrap();
        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
        assert_eq!(status.untracked.len(), 1);
        assert_eq!(status.untracked[0].path, "new_file.txt");
        assert_eq!(status.untracked[0].status, FileStatus::Untracked);
    }

    #[test]
    fn test_get_status_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        fs::write(temp_dir.path().join("staged.txt"), "content").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("staged.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(temp_dir.path()).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "staged.txt");
        assert_eq!(status.staged[0].status, FileStatus::Added);
        assert!(status.unstaged.is_empty());
        assert!(status.untracked.is_empty());
    }

    #[test]
    fn test_get_status_staged_modified_file() {
        let (temp_dir, repo) = create_test_repo();

        commit_file(&repo, "file.txt", "initial", "Initial commit");

        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "modified").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file.txt")).unwrap();
        index.write().unwrap();

        let status = get_status(temp_dir.path()).unwrap();
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "file.txt");
        assert_eq!(status.staged[0].status, FileStatus::Modified);
    }

    #[test]
    fn test_get_status_unstaged_modified_file() {
        let (temp_dir, repo) = create_test_repo();

        commit_file(&repo, "file.txt", "initial", "Initial commit");

        let repo_path = repo.workdir().unwrap();
        fs::write(repo_path.join("file.txt"), "modified").unwrap();

        let status = get_status(temp_dir.path()).unwrap();
        assert!(status.staged.is_empty());
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "file.txt");
        assert_eq!(status.unstaged[0].status, FileStatus::Modified);
    }

    #[test]
    fn test_get_file_diff_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        commit_file(&repo, "existing.txt", "existing", "Initial commit");

        fs::write(temp_dir.path().join("new.txt"), "line 1\nline 2\nline 3\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new.txt")).unwrap();
        index.write().unwrap();

        let diff = get_file_diff(temp_dir.path(), "new.txt", DiffTarget::Staged).unwrap();
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
    fn test_get_git_file_contents_staged_new_file() {
        let (temp_dir, repo) = create_test_repo();

        commit_file(&repo, "existing.txt", "existing", "Initial commit");

        let new_content = "line 1\nline 2\nline 3\n";
        fs::write(temp_dir.path().join("new.ts"), new_content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new.ts")).unwrap();
        index.write().unwrap();

        let contents = get_git_file_contents(temp_dir.path(), "new.ts", DiffTarget::Staged).unwrap();

        assert!(contents.old_file.content.is_none());
        assert_eq!(
            contents.new_file.content,
            Some(FileContent::Text {
                contents: new_content.to_string()
            })
        );
        assert_eq!(contents.old_file.lang, Some("typescript".to_string()));
        assert_eq!(contents.new_file.lang, Some("typescript".to_string()));
    }
}

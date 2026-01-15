use git2::Repository;
use std::path::Path;

/// Opens a git repository at the given path.
/// Returns the repository if found, or an error if the path is not a git repo.
pub fn open_repository(path: &Path) -> Result<Repository, git2::Error> {
    Repository::open(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::TempDir;

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
}

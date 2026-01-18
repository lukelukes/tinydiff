use fs2::FileExt;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs::{self, File};
use std::io;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub file_path: String,
    pub line_number: u32,
    pub content_hash: String,
    pub body: String,
    pub resolved: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommentCollection {
    pub comments: Vec<Comment>,
}

fn comments_file_path(repo_path: &Path) -> std::path::PathBuf {
    repo_path.join(".tinydiff").join("comments.json")
}

fn validate_file_path(file_path: &str) -> Result<(), io::Error> {
    if file_path.contains("..") || Path::new(file_path).is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid file path: must be relative and cannot contain '..'",
        ));
    }
    Ok(())
}

fn write_collection(repo_path: &Path, collection: &CommentCollection) -> Result<(), io::Error> {
    let dir_path = repo_path.join(".tinydiff");
    let file_path = comments_file_path(repo_path);
    let temp_path = dir_path.join("comments.json.tmp");

    let contents = serde_json::to_string_pretty(collection)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(&temp_path, &contents)?;
    if let Err(e) = fs::rename(&temp_path, file_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(e);
    }

    Ok(())
}

pub fn load_comments(repo_path: &Path) -> Result<CommentCollection, io::Error> {
    let path = comments_file_path(repo_path);
    if !path.exists() {
        return Ok(CommentCollection::default());
    }
    let contents = fs::read_to_string(&path)?;
    serde_json::from_str(&contents).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

pub fn save_comment(repo_path: &Path, comment: Comment) -> Result<(), io::Error> {
    validate_file_path(&comment.file_path)?;

    let dir_path = repo_path.join(".tinydiff");
    fs::create_dir_all(&dir_path)?;

    let lock_path = dir_path.join("comments.lock");
    let lock_file = File::create(&lock_path)?;
    lock_file.lock_exclusive()?;

    let mut collection = load_comments(repo_path)?;

    if let Some(existing) = collection.comments.iter_mut().find(|c| c.id == comment.id) {
        *existing = comment;
    } else {
        collection.comments.push(comment);
    }

    write_collection(repo_path, &collection)?;

    Ok(())
}

pub fn delete_comment(repo_path: &Path, comment_id: &str) -> Result<bool, io::Error> {
    let dir_path = repo_path.join(".tinydiff");
    if !dir_path.exists() {
        return Ok(false);
    }

    let lock_path = dir_path.join("comments.lock");
    let _lock_file = File::create(&lock_path)?;
    _lock_file.lock_exclusive()?;

    let collection = load_comments(repo_path)?;
    if collection.comments.is_empty() {
        return Ok(false);
    }

    let original_len = collection.comments.len();
    let mut collection = collection;
    collection.comments.retain(|c| c.id != comment_id);

    if collection.comments.len() == original_len {
        return Ok(false);
    }

    write_collection(repo_path, &collection)?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_comment(id: &str, body: &str) -> Comment {
        Comment {
            id: id.to_string(),
            file_path: "test.rs".to_string(),
            line_number: 10,
            content_hash: "abc123".to_string(),
            body: body.to_string(),
            resolved: false,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn test_load_returns_empty_when_no_file() {
        let temp_dir = TempDir::new().unwrap();
        let result = load_comments(temp_dir.path()).unwrap();
        assert!(result.comments.is_empty());
    }

    #[test]
    fn test_comment_crud_operations() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let comment_v1 = make_comment("c1", "first version");
        save_comment(repo_path, comment_v1).unwrap();
        let loaded = load_comments(repo_path).unwrap();
        assert_eq!(loaded.comments.len(), 1);
        assert_eq!(loaded.comments[0].body, "first version");

        let comment_v2 = make_comment("c1", "updated version");
        save_comment(repo_path, comment_v2).unwrap();
        let loaded = load_comments(repo_path).unwrap();
        assert_eq!(loaded.comments.len(), 1);
        assert_eq!(loaded.comments[0].body, "updated version");

        let deleted = delete_comment(repo_path, "c1").unwrap();
        assert!(deleted);
        let loaded = load_comments(repo_path).unwrap();
        assert!(loaded.comments.is_empty());
    }

    #[test]
    fn test_delete_returns_false_for_missing_id() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let result = delete_comment(repo_path, "nonexistent").unwrap();
        assert!(!result);

        save_comment(repo_path, make_comment("c1", "test")).unwrap();
        let result = delete_comment(repo_path, "other_id").unwrap();
        assert!(!result);
    }

    #[test]
    fn test_save_rejects_path_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let mut comment = make_comment("c1", "test");
        comment.file_path = "../etc/passwd".to_string();

        let result = save_comment(repo_path, comment);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn test_save_rejects_absolute_path() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let mut comment = make_comment("c1", "test");
        comment.file_path = "/etc/passwd".to_string();

        let result = save_comment(repo_path, comment);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn test_load_returns_invalid_data_for_corrupted_json() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let dir_path = repo_path.join(".tinydiff");
        fs::create_dir_all(&dir_path).unwrap();
        fs::write(dir_path.join("comments.json"), "{ invalid json }").unwrap();

        let result = load_comments(repo_path);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidData);
    }
}

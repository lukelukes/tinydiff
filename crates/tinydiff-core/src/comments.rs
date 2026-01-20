use crate::error::CoreError;
use crate::types::{Comment, CommentCollection};
use fs2::FileExt;
use std::fs::{self, File};
use std::path::Path;

fn comments_file_path(repo_path: &Path) -> std::path::PathBuf {
    repo_path.join(".tinydiff").join("comments.json")
}

fn validate_file_path(file_path: &str) -> Result<(), CoreError> {
    if file_path.contains("..") || Path::new(file_path).is_absolute() {
        return Err(CoreError::InvalidPath(
            "Invalid file path: must be relative and cannot contain '..'".to_string(),
        ));
    }
    Ok(())
}

fn build_context_window(lines: &[&str], line_idx: usize) -> String {
    let before = if line_idx > 0 {
        lines.get(line_idx - 1).copied().unwrap_or("")
    } else {
        ""
    };
    let target = lines.get(line_idx).copied().unwrap_or("");
    let after = lines.get(line_idx + 1).copied().unwrap_or("");
    format!("{}\n{}\n{}", before, target, after)
}

fn extract_context_window(file_contents: &str, line_number: u32) -> String {
    let lines: Vec<&str> = file_contents.lines().collect();
    let line_idx = (line_number.saturating_sub(1)) as usize;
    build_context_window(&lines, line_idx)
}

fn write_collection(repo_path: &Path, collection: &CommentCollection) -> Result<(), CoreError> {
    let dir_path = repo_path.join(".tinydiff");
    let file_path = comments_file_path(repo_path);
    let temp_path = dir_path.join("comments.json.tmp");

    let contents = serde_json::to_string_pretty(collection).map_err(|e| {
        CoreError::io(
            &file_path,
            std::io::Error::new(std::io::ErrorKind::InvalidData, e),
        )
    })?;
    fs::write(&temp_path, &contents).map_err(|e| CoreError::io(&temp_path, e))?;
    if let Err(e) = fs::rename(&temp_path, &file_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(CoreError::io(&file_path, e));
    }

    Ok(())
}

pub fn load_comments(repo_path: &Path) -> Result<CommentCollection, CoreError> {
    let path = comments_file_path(repo_path);
    if !path.exists() {
        return Ok(CommentCollection::default());
    }
    let contents = fs::read_to_string(&path).map_err(|e| CoreError::io(&path, e))?;
    serde_json::from_str(&contents).map_err(|e| {
        CoreError::io(
            &path,
            std::io::Error::new(std::io::ErrorKind::InvalidData, e),
        )
    })
}

pub fn save_comment(
    repo_path: &Path,
    mut comment: Comment,
    file_contents: Option<&str>,
) -> Result<(), CoreError> {
    validate_file_path(&comment.file_path)?;

    if let Some(contents) = file_contents
        && comment.line_number > 0
    {
        comment.context_window = Some(extract_context_window(contents, comment.line_number));
        comment.unanchored = false;
    }

    let dir_path = repo_path.join(".tinydiff");
    fs::create_dir_all(&dir_path).map_err(|e| CoreError::io(&dir_path, e))?;

    let lock_path = dir_path.join("comments.lock");
    let lock_file = File::create(&lock_path).map_err(|e| CoreError::io(&lock_path, e))?;
    lock_file
        .lock_exclusive()
        .map_err(|e| CoreError::io(&lock_path, e))?;

    let mut collection = load_comments(repo_path)?;

    if let Some(existing) = collection.comments.iter_mut().find(|c| c.id == comment.id) {
        *existing = comment;
    } else {
        collection.comments.push(comment);
    }

    write_collection(repo_path, &collection)?;

    Ok(())
}

pub fn delete_comment(repo_path: &Path, comment_id: &str) -> Result<bool, CoreError> {
    let dir_path = repo_path.join(".tinydiff");
    if !dir_path.exists() {
        return Ok(false);
    }

    let lock_path = dir_path.join("comments.lock");
    let lock_file = File::create(&lock_path).map_err(|e| CoreError::io(&lock_path, e))?;
    lock_file
        .lock_exclusive()
        .map_err(|e| CoreError::io(&lock_path, e))?;

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

pub fn re_anchor_comment(comment: &mut Comment, file_contents: &str) {
    let stored_context = match &comment.context_window {
        Some(ctx) => ctx,
        None => return,
    };

    let lines: Vec<&str> = file_contents.lines().collect();

    for (idx, _) in lines.iter().enumerate() {
        let window = build_context_window(&lines, idx);
        if window == *stored_context {
            comment.line_number = (idx + 1) as u32;
            comment.unanchored = false;
            return;
        }
    }

    comment.unanchored = true;
}

pub fn get_comments_for_file(
    repo_path: &Path,
    file_path: &str,
    file_contents: &str,
) -> Result<Vec<Comment>, CoreError> {
    validate_file_path(file_path)?;
    let collection = load_comments(repo_path)?;
    let mut result: Vec<Comment> = collection
        .comments
        .into_iter()
        .filter(|c| c.file_path == file_path)
        .collect();

    for comment in &mut result {
        re_anchor_comment(comment, file_contents);
    }

    Ok(result)
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
            body: body.to_string(),
            resolved: false,
            created_at: 1000,
            updated_at: 1000,
            context_window: None,
            unanchored: false,
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
        save_comment(repo_path, comment_v1, None).unwrap();
        let loaded = load_comments(repo_path).unwrap();
        assert_eq!(loaded.comments.len(), 1);
        assert_eq!(loaded.comments[0].body, "first version");

        let comment_v2 = make_comment("c1", "updated version");
        save_comment(repo_path, comment_v2, None).unwrap();
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

        save_comment(repo_path, make_comment("c1", "test"), None).unwrap();
        let result = delete_comment(repo_path, "other_id").unwrap();
        assert!(!result);
    }

    #[test]
    fn test_save_rejects_path_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let mut comment = make_comment("c1", "test");
        comment.file_path = "../etc/passwd".to_string();

        let result = save_comment(repo_path, comment, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_save_rejects_absolute_path() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let mut comment = make_comment("c1", "test");
        comment.file_path = "/etc/passwd".to_string();

        let result = save_comment(repo_path, comment, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_load_returns_error_for_corrupted_json() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let dir_path = repo_path.join(".tinydiff");
        fs::create_dir_all(&dir_path).unwrap();
        fs::write(dir_path.join("comments.json"), "{ invalid json }").unwrap();

        let result = load_comments(repo_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_build_context_window_middle() {
        let lines = vec!["line0", "line1", "line2", "line3", "line4"];
        let window = build_context_window(&lines, 2);
        assert_eq!(window, "line1\nline2\nline3");
    }

    #[test]
    fn test_build_context_window_first_line() {
        let lines = vec!["line0", "line1", "line2"];
        let window = build_context_window(&lines, 0);
        assert_eq!(window, "\nline0\nline1");
    }

    #[test]
    fn test_build_context_window_last_line() {
        let lines = vec!["line0", "line1", "line2"];
        let window = build_context_window(&lines, 2);
        assert_eq!(window, "line1\nline2\n");
    }

    #[test]
    fn test_re_anchor_finds_moved_line() {
        let original_contents = "alpha\nbeta\ngamma";
        let context = extract_context_window(original_contents, 2);

        let mut comment = make_comment("c1", "test");
        comment.line_number = 2;
        comment.context_window = Some(context);

        let new_contents = "new_line\nalpha\nbeta\ngamma";
        re_anchor_comment(&mut comment, new_contents);

        assert_eq!(comment.line_number, 3);
        assert!(!comment.unanchored);
    }

    #[test]
    fn test_re_anchor_marks_orphaned() {
        let original_contents = "alpha\nbeta\ngamma";
        let context = extract_context_window(original_contents, 2);

        let mut comment = make_comment("c1", "test");
        comment.line_number = 2;
        comment.context_window = Some(context);

        let new_contents = "completely\ndifferent\ncontent";
        re_anchor_comment(&mut comment, new_contents);

        assert_eq!(comment.line_number, 2);
        assert!(comment.unanchored);
    }

    #[test]
    fn test_re_anchor_no_context_noop() {
        let mut comment = make_comment("c1", "test");
        comment.line_number = 5;
        comment.context_window = None;

        let contents = "some\nfile\ncontents";
        re_anchor_comment(&mut comment, contents);

        assert_eq!(comment.line_number, 5);
        assert!(!comment.unanchored);
    }

    #[test]
    fn test_save_with_file_contents_computes_context() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let file_contents = "line1\nline2\nline3\nline4";
        let mut comment = make_comment("c1", "test");
        comment.line_number = 2;

        save_comment(repo_path, comment, Some(file_contents)).unwrap();
        let loaded = load_comments(repo_path).unwrap();

        assert!(loaded.comments[0].context_window.is_some());
        assert_eq!(
            loaded.comments[0].context_window.as_deref(),
            Some("line1\nline2\nline3")
        );
    }
}

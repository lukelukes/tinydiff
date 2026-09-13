use std::fs;
use std::path::Path;

use specta::TypeCollection;
use specta_typescript::{BigIntExportBehavior, Typescript};
use tinydiff_core::app::{AppMode, CommandError};
use tinydiff_core::types::{
    Comment, CommentAnchor, CommentCollection, DiffContent, DiffFile, DiffHunk, DiffLine,
    DiffTarget, FileContent, FileDiff, FileEntry, FileEntryKind, GitFileContents, GitStatus,
    LineChangeType, ReadFileResult,
};

const RESULT_TYPE: &str =
    "export type Result<T, E> = { status: \"ok\"; data: T } | { status: \"error\"; error: E };";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut types = TypeCollection::default();
    types
        .register::<AppMode>()
        .register::<CommandError>()
        .register::<Comment>()
        .register::<CommentAnchor>()
        .register::<CommentCollection>()
        .register::<DiffContent>()
        .register::<DiffFile>()
        .register::<DiffHunk>()
        .register::<DiffLine>()
        .register::<DiffTarget>()
        .register::<FileContent>()
        .register::<FileDiff>()
        .register::<FileEntry>()
        .register::<FileEntryKind>()
        .register::<GitFileContents>()
        .register::<GitStatus>()
        .register::<LineChangeType>()
        .register::<ReadFileResult>();

    let body = Typescript::default()
        .bigint(BigIntExportBehavior::Number)
        .framework_header("")
        .export(&types)?;

    let output = format!("{RESULT_TYPE}\n\n{}\n", body.trim());
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/bindings/types.ts");
    fs::create_dir_all(path.parent().ok_or("types.ts has no parent directory")?)?;
    fs::write(&path, output)?;
    println!("wrote {}", path.display());
    Ok(())
}

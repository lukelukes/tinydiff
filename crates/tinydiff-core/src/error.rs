use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("git operation failed: {0}")]
    Git(#[from] git2::Error),

    #[error("IO error for '{path}': {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("invalid path: {0}")]
    InvalidPath(String),

    #[error("task panicked: {0}")]
    TaskPanic(#[from] tokio::task::JoinError),
}

impl CoreError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

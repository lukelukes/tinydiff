use serde::{Deserialize, Serialize};
use specta::Type;
use std::ffi::OsStr;
use std::path::Path;

/// Map file extension to Shiki language identifier
pub fn extension_to_lang(path: &str) -> Option<String> {
    let file_path = Path::new(path);

    // First check filename for extensionless files and dotfiles
    if let Some(filename) = file_path.file_name().and_then(|f| f.to_str()) {
        let lang = match filename.to_lowercase().as_str() {
            "makefile" | "gnumakefile" => Some("makefile"),
            "dockerfile" => Some("dockerfile"),
            ".gitignore" | ".dockerignore" => Some("ignore"),
            ".env" | ".env.local" | ".env.example" => Some("properties"),
            _ => None,
        };
        if lang.is_some() {
            return lang.map(String::from);
        }
    }

    // Then check extension
    let ext = file_path
        .extension()
        .and_then(OsStr::to_str)?
        .to_lowercase();

    let lang = match ext.as_str() {
        // Web
        "js" | "mjs" | "cjs" => "javascript",
        "ts" | "mts" | "cts" => "typescript",
        "tsx" => "tsx",
        "jsx" => "jsx",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "json" => "json",
        "jsonc" => "jsonc",
        "xml" => "xml",
        "svg" => "xml",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        // Systems
        "rs" => "rust",
        "go" => "go",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" => "cpp",
        "zig" => "zig",
        // Scripting
        "py" => "python",
        "rb" => "ruby",
        "php" => "php",
        "lua" => "lua",
        "sh" | "bash" | "zsh" => "bash",
        "fish" => "fish",
        "ps1" | "psm1" => "powershell",
        // JVM
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "scala" | "sc" => "scala",
        "groovy" | "gradle" => "groovy",
        // Other
        "sql" => "sql",
        "md" | "markdown" => "markdown",
        "dockerfile" => "dockerfile",
        "makefile" | "mk" => "makefile",
        "graphql" | "gql" => "graphql",
        "vue" => "vue",
        "svelte" => "svelte",
        "astro" => "astro",
        "swift" => "swift",
        "r" => "r",
        "dart" => "dart",
        "ex" | "exs" => "elixir",
        "erl" | "hrl" => "erlang",
        "hs" | "lhs" => "haskell",
        "ml" | "mli" => "ocaml",
        "clj" | "cljs" | "cljc" | "edn" => "clojure",
        "lisp" | "cl" | "el" => "lisp",
        "nim" => "nim",
        "v" => "v",
        "tf" | "tfvars" => "hcl",
        "nix" => "nix",
        "proto" => "protobuf",
        "prisma" => "prisma",
        "sol" => "solidity",
        _ => return None,
    };

    Some(lang.to_string())
}

/// Result of reading a file from the filesystem
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub name: String,
    pub contents: String,
    pub lang: Option<String>,
    pub is_binary: bool,
}

/// Maximum file size limit (50 MB) to prevent memory DoS
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// Read a file from the filesystem for file comparison mode.
/// Handles non-UTF-8 content with replacement characters.
pub fn read_file(file_path: &Path) -> Result<ReadFileResult, std::io::Error> {
    // Check file size before reading to prevent memory DoS
    let metadata = std::fs::metadata(file_path)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!(
                "File too large: {} bytes (max {} bytes)",
                metadata.len(),
                MAX_FILE_SIZE
            ),
        ));
    }

    let bytes = std::fs::read(file_path)?;

    // Check for binary content (null bytes)
    let is_binary = bytes.contains(&0);

    let contents = if is_binary {
        String::new()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };

    let name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let path_str = file_path.to_string_lossy();
    let lang = extension_to_lang(&path_str);

    Ok(ReadFileResult {
        name,
        contents,
        lang,
        is_binary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_extension_to_lang() {
        // Standard extensions
        assert_eq!(extension_to_lang("file.rs"), Some("rust".to_string()));
        assert_eq!(extension_to_lang("file.ts"), Some("typescript".to_string()));
        assert_eq!(extension_to_lang("file.tsx"), Some("tsx".to_string()));
        assert_eq!(extension_to_lang("file.py"), Some("python".to_string()));
        assert_eq!(extension_to_lang("file.go"), Some("go".to_string()));
        assert_eq!(extension_to_lang("file.unknown"), None);
        assert_eq!(extension_to_lang("noextension"), None);
        assert_eq!(
            extension_to_lang("path/to/file.js"),
            Some("javascript".to_string())
        );

        // New extensions: proto, prisma, solidity
        assert_eq!(
            extension_to_lang("schema.proto"),
            Some("protobuf".to_string())
        );
        assert_eq!(
            extension_to_lang("schema.prisma"),
            Some("prisma".to_string())
        );
        assert_eq!(
            extension_to_lang("contract.sol"),
            Some("solidity".to_string())
        );

        // Extensionless files
        assert_eq!(extension_to_lang("Makefile"), Some("makefile".to_string()));
        assert_eq!(
            extension_to_lang("GNUmakefile"),
            Some("makefile".to_string())
        );
        assert_eq!(
            extension_to_lang("Dockerfile"),
            Some("dockerfile".to_string())
        );
        assert_eq!(
            extension_to_lang("path/to/Makefile"),
            Some("makefile".to_string())
        );

        // Dotfiles
        assert_eq!(extension_to_lang(".gitignore"), Some("ignore".to_string()));
        assert_eq!(
            extension_to_lang(".dockerignore"),
            Some("ignore".to_string())
        );
        assert_eq!(extension_to_lang(".env"), Some("properties".to_string()));
        assert_eq!(
            extension_to_lang(".env.local"),
            Some("properties".to_string())
        );
        assert_eq!(
            extension_to_lang(".env.example"),
            Some("properties".to_string())
        );
        assert_eq!(
            extension_to_lang("path/to/.gitignore"),
            Some("ignore".to_string())
        );
    }

    #[test]
    fn test_read_file_text() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.ts");
        let content = "const x = 1;\nconst y = 2;\n";
        fs::write(&file_path, content).unwrap();

        let result = read_file(&file_path).unwrap();

        assert_eq!(result.name, "test.ts");
        assert_eq!(result.contents, content);
        assert_eq!(result.lang, Some("typescript".to_string()));
        assert!(!result.is_binary);
    }

    #[test]
    fn test_read_file_non_utf8() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        // Invalid UTF-8 sequence
        let bytes: Vec<u8> = vec![0x48, 0x65, 0x6C, 0x6C, 0x6F, 0xFF, 0xFE];
        fs::write(&file_path, &bytes).unwrap();

        let result = read_file(&file_path).unwrap();

        assert_eq!(result.name, "test.txt");
        // Should contain replacement character for invalid bytes
        assert!(result.contents.contains('\u{FFFD}'));
        assert!(!result.is_binary);
    }

    #[test]
    fn test_read_file_binary() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.bin");
        // Binary content with null bytes
        let bytes: Vec<u8> = vec![0x00, 0x01, 0x02, 0x03];
        fs::write(&file_path, &bytes).unwrap();

        let result = read_file(&file_path).unwrap();

        assert_eq!(result.name, "test.bin");
        assert!(result.contents.is_empty()); // Binary files return empty contents
        assert!(result.is_binary);
    }

    #[test]
    fn test_read_file_language_hint() {
        let temp_dir = TempDir::new().unwrap();

        // Test various extensions
        let test_cases = [
            ("test.rs", Some("rust".to_string())),
            ("test.py", Some("python".to_string())),
            ("test.tsx", Some("tsx".to_string())),
            ("test.unknown", None),
        ];

        for (filename, expected_lang) in test_cases {
            let file_path = temp_dir.path().join(filename);
            fs::write(&file_path, "content").unwrap();

            let result = read_file(&file_path).unwrap();
            assert_eq!(result.lang, expected_lang, "Failed for {}", filename);
        }
    }

    #[test]
    fn test_read_file_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("nonexistent.txt");

        let result = read_file(&file_path);
        assert!(result.is_err());
    }
}

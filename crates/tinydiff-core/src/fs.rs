use crate::error::CoreError;
use crate::types::ReadFileResult;
use std::ffi::OsStr;
use std::path::Path;

pub fn extension_to_lang(path: &str) -> Option<String> {
    let file_path = Path::new(path);

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

    let ext = file_path
        .extension()
        .and_then(OsStr::to_str)?
        .to_lowercase();

    let lang = match ext.as_str() {
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
        "xml" | "svg" => "xml",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "rs" => "rust",
        "go" => "go",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" => "cpp",
        "zig" => "zig",
        "py" => "python",
        "rb" => "ruby",
        "php" => "php",
        "lua" => "lua",
        "sh" | "bash" | "zsh" => "bash",
        "fish" => "fish",
        "ps1" | "psm1" => "powershell",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "scala" | "sc" => "scala",
        "groovy" | "gradle" => "groovy",
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

    Some(lang.to_owned())
}

const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

pub fn read_file(file_path: &Path) -> Result<ReadFileResult, CoreError> {
    let metadata = std::fs::metadata(file_path).map_err(|e| CoreError::io(file_path, e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(CoreError::io(
            file_path,
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "File too large: {} bytes (max {} bytes)",
                    metadata.len(),
                    MAX_FILE_SIZE
                ),
            ),
        ));
    }

    let bytes = std::fs::read(file_path).map_err(|e| CoreError::io(file_path, e))?;

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
        .to_owned();

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
        let bytes: Vec<u8> = vec![0x48, 0x65, 0x6C, 0x6C, 0x6F, 0xFF, 0xFE];
        fs::write(&file_path, &bytes).unwrap();

        let result = read_file(&file_path).unwrap();

        assert_eq!(result.name, "test.txt");
        assert!(result.contents.contains('\u{FFFD}'));
        assert!(!result.is_binary);
    }

    #[test]
    fn test_read_file_binary() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.bin");
        let bytes: Vec<u8> = vec![0x00, 0x01, 0x02, 0x03];
        fs::write(&file_path, &bytes).unwrap();

        let result = read_file(&file_path).unwrap();

        assert_eq!(result.name, "test.bin");
        assert!(result.contents.is_empty());
        assert!(result.is_binary);
    }

    #[test]
    fn test_read_file_language_hint() {
        let temp_dir = TempDir::new().unwrap();

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

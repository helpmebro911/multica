/**
 * Upload file type configuration.
 *
 * Aligned with what Claude Code agents can natively read:
 * - Images: multimodal vision (Read tool)
 * - PDF: Read tool (max 20 pages at a time)
 * - Text/code: Read tool (plain text)
 * - JSON: Read tool (plain text)
 *
 * NOT supported (Agent can't read):
 * - Video/audio: Claude has no AV processing
 * - Office binary (.docx/.xlsx): needs conversion tools
 * - Arbitrary binaries: no use case
 */

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** MIME patterns — exact match or wildcard (e.g. "text/*") */
export const ALLOWED_MIME_PATTERNS: readonly string[] = [
  // Images (Agent: multimodal vision)
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents (Agent: Read tool)
  "application/pdf",
  // Text & code (Agent: Read tool, plain text)
  "text/*",
  // Structured data (Agent: Read tool)
  "application/json",
];

/**
 * Extra file extensions for the HTML accept attribute.
 * Needed because browsers don't always map these extensions to MIME types.
 */
const EXTRA_EXTENSIONS = [
  ".md", ".markdown", ".csv", ".json",
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".rs", ".rb", ".java",
  ".c", ".cpp", ".h", ".sql",
  ".yaml", ".yml", ".toml", ".xml", ".sh",
  ".ipynb",
];

/**
 * HTML accept attribute value for <input type="file">.
 * Derived from ALLOWED_MIME_PATTERNS + extra extensions.
 */
export const FILE_INPUT_ACCEPT = [
  ...ALLOWED_MIME_PATTERNS,
  ...EXTRA_EXTENSIONS,
].join(",");

/**
 * Extension-to-MIME fallback for files where `file.type` is empty.
 * Browsers often report "" for .go, .rs, .toml, .yaml, etc.
 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "text/xml",
  ".svg": "image/svg+xml",
  ".ts": "text/x-typescript",
  ".tsx": "text/x-typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".py": "text/x-python",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".rb": "text/x-ruby",
  ".java": "text/x-java",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".h": "text/x-c",
  ".sql": "text/x-sql",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/x-toml",
  ".sh": "text/x-sh",
  ".ipynb": "application/json",
};

function matchesMimePattern(mimeType: string): boolean {
  const ct = mimeType.toLowerCase();
  return ALLOWED_MIME_PATTERNS.some((pattern) => {
    if (pattern.endsWith("/*")) {
      return ct.startsWith(pattern.slice(0, -1));
    }
    return ct === pattern;
  });
}

/**
 * Check if a file is an allowed upload type.
 * Uses MIME type when available, falls back to extension for files
 * where the browser reports an empty type (e.g. .go, .rs, .toml).
 */
export function isAllowedFileType(mimeType: string, filename?: string): boolean {
  if (mimeType && matchesMimePattern(mimeType)) return true;

  // Fallback: infer MIME from extension when browser reports empty type
  if (filename) {
    const ext = filename.lastIndexOf(".") >= 0
      ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
      : "";
    const inferred = EXTENSION_MIME_MAP[ext];
    if (inferred && matchesMimePattern(inferred)) return true;
  }

  return false;
}

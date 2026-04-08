import { describe, it, expect } from "vitest";
import {
  isAllowedFileType,
  ALLOWED_MIME_PATTERNS,
  MAX_FILE_SIZE,
} from "../upload";

describe("upload constants", () => {
  it("allows standard image types", () => {
    expect(isAllowedFileType("image/png")).toBe(true);
    expect(isAllowedFileType("image/jpeg")).toBe(true);
    expect(isAllowedFileType("image/gif")).toBe(true);
    expect(isAllowedFileType("image/webp")).toBe(true);
    expect(isAllowedFileType("image/svg+xml")).toBe(true);
  });

  it("allows PDF", () => {
    expect(isAllowedFileType("application/pdf")).toBe(true);
  });

  it("allows text types via wildcard", () => {
    expect(isAllowedFileType("text/plain")).toBe(true);
    expect(isAllowedFileType("text/markdown")).toBe(true);
    expect(isAllowedFileType("text/csv")).toBe(true);
    expect(isAllowedFileType("text/html")).toBe(true);
    expect(isAllowedFileType("text/x-python")).toBe(true);
  });

  it("allows JSON", () => {
    expect(isAllowedFileType("application/json")).toBe(true);
  });

  it("rejects video/audio", () => {
    expect(isAllowedFileType("video/mp4")).toBe(false);
    expect(isAllowedFileType("audio/mpeg")).toBe(false);
  });

  it("rejects Office binary formats", () => {
    expect(
      isAllowedFileType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(false);
  });

  it("rejects unknown types", () => {
    expect(isAllowedFileType("application/octet-stream")).toBe(false);
  });

  it("handles case-insensitivity", () => {
    expect(isAllowedFileType("IMAGE/PNG")).toBe(true);
    expect(isAllowedFileType("Text/Plain")).toBe(true);
  });

  it("rejects empty MIME type without filename", () => {
    expect(isAllowedFileType("")).toBe(false);
  });

  it("falls back to extension when MIME type is empty", () => {
    expect(isAllowedFileType("", "main.go")).toBe(true);
    expect(isAllowedFileType("", "lib.rs")).toBe(true);
    expect(isAllowedFileType("", "config.toml")).toBe(true);
    expect(isAllowedFileType("", "data.yaml")).toBe(true);
    expect(isAllowedFileType("", "script.py")).toBe(true);
    expect(isAllowedFileType("", "notes.md")).toBe(true);
  });

  it("rejects unknown extension even with fallback", () => {
    expect(isAllowedFileType("", "video.mp4")).toBe(false);
    expect(isAllowedFileType("", "archive.zip")).toBe(false);
    expect(isAllowedFileType("", "noext")).toBe(false);
  });

  it("exports MAX_FILE_SIZE as 100MB", () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  it("exports ALLOWED_MIME_PATTERNS as non-empty array", () => {
    expect(ALLOWED_MIME_PATTERNS).toBeInstanceOf(Array);
    expect(ALLOWED_MIME_PATTERNS.length).toBeGreaterThan(0);
  });
});

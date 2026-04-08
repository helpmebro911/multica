"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/shared/api";
import type { Attachment } from "@/shared/types";
import { MAX_FILE_SIZE, isAllowedFileType } from "@/shared/constants/upload";

export interface UploadResult {
  id: string;
  filename: string;
  link: string;
}

export interface UploadContext {
  issueId?: string;
  commentId?: string;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File, ctx?: UploadContext): Promise<UploadResult | null> => {
      if (!isAllowedFileType(file.type, file.name)) {
        throw new Error(
          `Unsupported file type: ${file.type || file.name.split(".").pop()}`,
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File exceeds 100 MB limit");
      }

      setUploading(true);
      try {
        const att: Attachment = await api.uploadFile(file, {
          issueId: ctx?.issueId,
          commentId: ctx?.commentId,
        });
        return { id: att.id, filename: att.filename, link: att.url };
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const uploadWithToast = useCallback(
    async (file: File, ctx?: UploadContext): Promise<UploadResult | null> => {
      try {
        return await upload(file, ctx);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        return null;
      }
    },
    [upload],
  );

  return { upload, uploadWithToast, uploading };
}

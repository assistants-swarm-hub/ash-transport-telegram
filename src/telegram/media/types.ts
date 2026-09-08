/**
 * Media types for this app's ingestion pipeline — the tg half of the v1
 * vision types (`features/vision/types.ts`), ported with the source split:
 * detection + bytes are the source's job; describing them is the core's.
 */

export const MEDIA_KINDS = [
  "photo",
  "sticker",
  "image_document",
  "animation",
  "video",
  "voice",
  /** A text-like file (CSV, JSON, XLSX, …), forwarded whole for the core to keep. */
  "document",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/** A normalized image ready to store/serve: base64 JPEG + mime hint. */
export interface ImagePayload {
  base64: string;
  mimeHint: string;
}

/** The media found on a Telegram message, before download. */
export interface DetectedMedia {
  kind: MediaKind;
  /** The concrete file to read (the media itself; frames sampled for video). */
  fileId: string;
  fileUniqueId: string | null;
  /** A sticker's emoji / pack hint, stored for the core's describe prompt. */
  visionHint: string | null;
  /** Whether `fileId` is a video/GIF that must be frame-sampled (ffmpeg). */
  isVideo: boolean;
  /** Whether `fileId` is audio (voice) stored as-is and transcribed by the core. */
  isAudio: boolean;
  /** Whether `fileId` is a document forwarded whole — never decoded, never sampled. */
  isDocument: boolean;
  /** The document's own name and mime type, as Telegram reports them. */
  filename: string | null;
  mimeType: string | null;
  /** Telegram's declared size (documents), so an oversize file is never downloaded. */
  fileSize: number | null;
  /** Telegram's single-frame thumbnail — the fallback when sampling fails. */
  thumbnailFileId: string | null;
  /** Duration in seconds (video/animation/voice), for even frame spacing. */
  durationSec: number | null;
}

/** A stored media row with its pending payload assembled from the blobs. */
export interface StoredMedia {
  id: string;
  chatId: string;
  telegramMessageId: number;
  kind: string;
  fileId: string;
  fileUniqueId: string | null;
  mimeType: string | null;
  visionHint: string | null;
  description: string | null;
  status: string;
  /** Pending payload as base64 (frames / single image / raw audio); empty once dropped. */
  frames: string[];
  createdAt: Date;
  describedAt: Date | null;
}

import { isDocumentFile } from "@assistants-swarm-hub/transport-sdk";
import type { Document, Message, Sticker } from "@grammyjs/types";

import type { DetectedMedia, MediaKind } from "./types";

/**
 * Ported verbatim from v1 `features/vision/detect.ts` with the source split
 * (media detection reads Telegram wire shapes, so it lives in this app).
 */

/**
 * Pure detection of readable media on a Telegram message. Decides *what*
 * file to read and how to hint the describer — the actual download and frame
 * extraction live in the server-only modules. Client-safe (only `@grammyjs/types`,
 * which are types).
 *
 * Precedence mirrors the MVP, with one change: a video/GIF (`animation`/`video`,
 * which Telegram delivers as mp4) now points at the **actual media file** so the
 * server can sample frames with ffmpeg. Telegram's single-frame thumbnail is kept
 * as a fallback for when frame extraction is unavailable. Photos, image documents,
 * and static stickers are still decoded directly as still images. A document
 * that is a text-like file (the contract's `isDocumentFile`) is forwarded whole
 * as a `document`; any other document is not media and is not forwarded.
 */

/** A short describe hint for a sticker: its emoji and pack name when present. */
function stickerHint(sticker: Sticker): string | null {
  const parts: string[] = [];
  if (sticker.emoji) parts.push(`Sticker emoji: ${sticker.emoji}`);
  if (sticker.set_name) parts.push(`Sticker pack: ${sticker.set_name}`);
  return parts.length > 0 ? parts.join(". ") : null;
}

/** True for a document that is really a video/gif (not a PDF etc.). */
function isVideoLikeDocument(document: Document): boolean {
  const mime = document.mime_type ?? "";
  return mime.startsWith("video/") || mime === "image/gif";
}

/** The fields every detection carries with a neutral value. */
const NONE = {
  isVideo: false,
  isAudio: false,
  isDocument: false,
  filename: null,
  mimeType: null,
  fileSize: null,
  thumbnailFileId: null,
  durationSec: null,
} satisfies Omit<DetectedMedia, "kind" | "fileId" | "fileUniqueId" | "visionHint">;

/**
 * The readable media on a message, or null when there is none. Returns the
 * concrete `file_id` to read plus, for video/GIF media, the flag + thumbnail +
 * duration the server needs to sample frames.
 */
export function detectMessageMedia(message: Message): DetectedMedia | null {
  // Voice first: a voice message carries nothing else, and its handling (store
  // OGG bytes, transcribe) is disjoint from every image path below.
  if (message.voice) {
    const voice = message.voice;
    return {
      ...NONE,
      kind: "voice",
      fileId: voice.file_id,
      fileUniqueId: voice.file_unique_id ?? null,
      visionHint: null,
      isAudio: true,
      durationSec: voice.duration ?? null,
    };
  }

  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    return image("photo", photo.file_id, photo.file_unique_id, null);
  }

  if (message.sticker) {
    const sticker = message.sticker;
    const animated = sticker.is_animated || sticker.is_video;
    // Animated (.tgs) / video (.webm) stickers are not still images — read their
    // JPEG thumbnail. A static (.webp) sticker is decoded directly.
    const fileId = animated ? sticker.thumbnail?.file_id : sticker.file_id;
    const fileUniqueId = animated ? sticker.thumbnail?.file_unique_id : sticker.file_unique_id;
    if (!fileId) return null;
    return image("sticker", fileId, fileUniqueId ?? null, stickerHint(sticker));
  }

  if (message.document?.mime_type?.startsWith("image/") && message.document.mime_type !== "image/gif") {
    const doc = message.document;
    return image("image_document", doc.file_id, doc.file_unique_id, null);
  }

  const animated = message.animation ?? message.video;
  if (animated) {
    const kind: MediaKind = message.animation ? "animation" : "video";
    return video(kind, animated.file_id, animated.file_unique_id, {
      thumbnailFileId: animated.thumbnail?.file_id ?? null,
      durationSec: animated.duration ?? null,
    });
  }

  if (message.document && isVideoLikeDocument(message.document)) {
    const doc = message.document;
    const kind: MediaKind = doc.mime_type === "image/gif" ? "animation" : "video";
    return video(kind, doc.file_id, doc.file_unique_id, {
      thumbnailFileId: doc.thumbnail?.file_id ?? null,
      durationSec: null,
    });
  }

  // A text-like file travels whole; anything else Telegram calls a document
  // (a PDF, an archive, a binary) is not media the core can read.
  if (
    message.document &&
    isDocumentFile({ filename: message.document.file_name, mimeType: message.document.mime_type })
  ) {
    const doc = message.document;
    return {
      ...NONE,
      kind: "document",
      fileId: doc.file_id,
      fileUniqueId: doc.file_unique_id ?? null,
      visionHint: null,
      isDocument: true,
      filename: doc.file_name ?? null,
      mimeType: doc.mime_type ?? null,
      fileSize: doc.file_size ?? null,
    };
  }

  return null;
}

/** A still image: decoded directly, no frame extraction. */
function image(
  kind: MediaKind,
  fileId: string,
  fileUniqueId: string | null,
  visionHint: string | null,
): DetectedMedia {
  return { ...NONE, kind, fileId, fileUniqueId, visionHint };
}

/** A video/GIF: the server samples frames from `fileId` (thumbnail as fallback). */
function video(
  kind: MediaKind,
  fileId: string,
  fileUniqueId: string | null,
  opts: { thumbnailFileId: string | null; durationSec: number | null },
): DetectedMedia {
  return {
    ...NONE,
    kind,
    fileId,
    fileUniqueId,
    visionHint: null,
    isVideo: true,
    thumbnailFileId: opts.thumbnailFileId,
    durationSec: opts.durationSec,
  };
}

/** Whether a message carries any readable media (visual, a voice message, or a document). */
export function messageHasVisionMedia(message: Message | undefined): boolean {
  return message ? detectMessageMedia(message) !== null : false;
}

/**
 * The first message in a reply chain (up to `maxDepth`) that carries
 * readable media — so "what is this?" as a reply to an earlier image
 * resolves to that image.
 */
export function findReplyMediaMessage(
  message: Message | undefined,
  maxDepth = 4,
): Message | null {
  let current: Message | undefined = message?.reply_to_message;
  let depth = 0;
  while (current && depth < maxDepth) {
    if (messageHasVisionMedia(current)) return current;
    current = current.reply_to_message;
    depth++;
  }
  return null;
}

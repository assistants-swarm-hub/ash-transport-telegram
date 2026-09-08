import type { Message } from "@grammyjs/types";
import { describe, expect, it } from "vitest";

import type { TgUpdate } from "../telegram/adapter";
import { createNormalizer } from "./normalize";

/**
 * What this transport reads OFF a Telegram update. What the result becomes —
 * the dedupe key, the receivers, the envelope — is the runtime's, and is
 * tested in the SDK; here the only question is whether Telegram's wire shape
 * was understood.
 */

const normalize = createNormalizer({ download: async () => null });

function update(overrides: Partial<Message> = {}): TgUpdate {
  return {
    message: {
      message_id: 42,
      date: 1_756_400_000,
      chat: { id: -100200, type: "supergroup", title: "The group" },
      from: { id: 7, is_bot: false, first_name: "Sam", username: "Sam" },
      text: "hello",
      ...overrides,
    } as TgUpdate["message"],
    botToken: "token",
    botId: 1001,
  };
}

describe("createNormalizer", () => {
  it("reads a group message into the contract's vocabulary", async () => {
    const message = await normalize(update());
    expect(message).toMatchObject({
      chatId: "-100200",
      direct: false,
      chatTitle: "The group",
      chatType: "supergroup",
      sourceMessageId: "42",
      content: "hello",
      // Usernames are lower-cased; the platform treats them case-insensitively.
      sender: { userId: "7", username: "sam", firstName: "Sam", lastName: null },
      media: null,
    });
    expect(message?.sentAt).toBe(new Date(1_756_400_000_000).toISOString());
  });

  it("marks a private chat direct and drops the group-only fields", async () => {
    const message = await normalize(
      update({ chat: { id: 7, type: "private", first_name: "Sam" } as Message["chat"] }),
    );
    expect(message).toMatchObject({ direct: true, chatType: null, chatTitle: null });
  });

  it("carries a caption as the content, and a forum thread as the thread id", async () => {
    const message = await normalize(
      update({ text: undefined, caption: "look at this", message_thread_id: 9 }),
    );
    expect(message).toMatchObject({ content: "look at this", threadId: "9" });
  });

  it("names a quoted bot author by platform id, not as a person", async () => {
    const message = await normalize(
      update({
        reply_to_message: {
          message_id: 30,
          date: 1_756_399_000,
          chat: { id: -100200, type: "supergroup", title: "The group" },
          from: { id: 1002, is_bot: true, first_name: "Igor" },
          text: "igor said this",
        } as Message["reply_to_message"],
      }),
    );
    // The runtime turns the platform id into an assistant id; a bot is never
    // reported as a person.
    expect(message?.replyTo).toMatchObject({
      sourceMessageId: "30",
      text: "igor said this",
      author: null,
      authorPlatformId: "1002",
    });
  });

  it("reports a human quote author as a person", async () => {
    const message = await normalize(
      update({
        reply_to_message: {
          message_id: 31,
          date: 1_756_399_000,
          chat: { id: -100200, type: "supergroup", title: "The group" },
          from: { id: 8, is_bot: false, first_name: "Lee", username: "LEE" },
          text: "earlier",
        } as Message["reply_to_message"],
      }),
    );
    expect(message?.replyTo).toMatchObject({
      author: { userId: "8", username: "lee", firstName: "Lee" },
      authorPlatformId: null,
    });
  });

  it("forwards a text-like document whole, with its name and mime type", async () => {
    const csv = Buffer.from("title,year\nHeat,1995\n");
    const withBytes = createNormalizer({
      download: async () => ({ base64: csv.toString("base64"), mimeHint: "image/jpeg" }),
    });
    const inbound = await withBytes(
      update({
        text: undefined,
        caption: "my watchlist",
        document: {
          file_id: "doc-1",
          file_unique_id: "u-doc-1",
          file_name: "watchlist.csv",
          mime_type: "text/csv",
          file_size: csv.length,
        },
      }),
    );
    expect(inbound?.content).toBe("my watchlist");
    expect(inbound?.media).toMatchObject({
      kind: "document",
      filename: "watchlist.csv",
      mimeType: "text/csv",
      frames: [csv.toString("base64")],
      unavailable: false,
    });
  });

  it("reports an oversize document as unavailable without downloading it", async () => {
    let downloads = 0;
    const counting = createNormalizer({
      download: async () => {
        downloads++;
        return null;
      },
    });
    const inbound = await counting(
      update({
        text: undefined,
        document: {
          file_id: "doc-2",
          file_unique_id: "u-doc-2",
          file_name: "huge.csv",
          mime_type: "text/csv",
          file_size: 11 * 1024 * 1024,
        },
      }),
    );
    expect(downloads).toBe(0);
    expect(inbound?.media).toMatchObject({ kind: "document", filename: "huge.csv", unavailable: true });
  });

  it("forwards no media for a document that is not text-like", async () => {
    const inbound = await normalize(
      update({
        text: undefined,
        caption: "the paper",
        document: {
          file_id: "doc-3",
          file_unique_id: "u-doc-3",
          file_name: "paper.pdf",
          mime_type: "application/pdf",
          file_size: 1024,
        },
      }),
    );
    expect(inbound?.content).toBe("the paper");
    expect(inbound?.media).toBeNull();
  });

  it("skips an update with neither text nor media", async () => {
    expect(await normalize(update({ text: undefined }))).toBeNull();
  });

  it("skips an update with no sender at all", async () => {
    // An anonymous channel post has nobody to attribute it to.
    expect(await normalize(update({ from: undefined }))).toBeNull();
  });
});

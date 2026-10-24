import { defineTransport } from "@assistants-swarm-hub/transport-sdk";

import { descriptor } from "./descriptor";
import { addressing } from "./inbound/addressing";
import { createNormalizer } from "./inbound/normalize";
import { telegramAdapter } from "./telegram/adapter";
import { registerReactionTool } from "./telegram/reaction-tool";

/**
 * The Telegram transport, whole: the package the core hosts. What a
 * transport is — a descriptor, a platform adapter, a normalizer, an
 * addressing rule, and the words and tools of its own — and nothing else.
 * Everything that is true of any transport (registering, reconciling
 * connections from the desired state, deduping shared chats, assembling
 * and publishing events, splitting and performing sends, hosting the
 * delivery tools, shutting down in order) is the core's host.
 */
export default defineTransport({
  descriptor,
  adapter: telegramAdapter,
  normalize: createNormalizer(),
  addressing,
  // The delivery tools are the contract's, but they speak to a model about a
  // specific platform, so the words are this transport's to choose.
  tools: {
    platform: "Telegram",
    // Reacting is Telegram's own tool: the 73 emoji it takes are its own.
    register: registerReactionTool,
  },
});

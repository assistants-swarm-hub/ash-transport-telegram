import "dotenv/config";

import { startTransportService } from "@assistants-swarm-hub/transport-sdk";

import transport from "./transport";

/**
 * The Telegram transport as its own service, for a core that reaches
 * transports over the wire. The transport itself is `transport.ts` — the
 * same object a core that hosts packages imports.
 */

await startTransportService({ ...transport, defaultPort: 3210 });

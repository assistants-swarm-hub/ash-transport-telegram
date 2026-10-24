# ash-transport-telegram

The **Telegram transport** for [assistants-swarm-hub][core], as the package
`@assistants-swarm-hub/ash-transport-telegram`: the core hosts it in its own
process, runs a poller for each assistant's bot, forwards every update as the
contract's events, performs the sends, and offers Telegram's own actions as
MCP tools.

It has no process, no port and no files of its own. Everything it knows at
runtime it learns from the core (which bots to run, with which tokens), and
its whole job is translation.

It is also the **worked example** for [Adding a transport][manual]: the four
things a transport implements are the four things in this repository, and
everything else that manual describes is the core doing it.

## Install it into a core

```bash
npm install @assistants-swarm-hub/ash-transport-telegram
```

then restart the core. It finds the package among its installed dependencies,
registers it, and the transport appears on the dashboard, where each
assistant gets a Telegram connection section with the bot token field this
package announces. No core change, no service to add.

The package lives in the org's registry on GitHub Packages, which wants a
token on every request: a public package there is readable by any account,
but not anonymously. Point the scope at the registry in the core's `.npmrc`
and keep a token with `read:packages` in your user-level `~/.npmrc`:

```
# .npmrc
@assistants-swarm-hub:registry=https://npm.pkg.github.com
```

```
# ~/.npmrc
//npm.pkg.github.com/:_authToken=<token>
```

## What lives where

Almost nothing. Registration, reconcile, deduping, event assembly, the sends,
the delivery tools and shutdown are all the core's host — the same for every
platform, so they live in one place. What is here is Telegram, and the
boundary is the folder: `telegram/` is the only code that knows the Bot API
exists, and replacing it is what gets you a different transport.

```
src/
  index.ts              the package: the four pieces, on defineTransport
  descriptor.ts         who this transport is: id, name, config fields, limits

  telegram/             the only code that knows the Bot API
    adapter.ts          connection lifecycle and what each update means
    connection.ts       the platform actions (text, voice, photos, files, menus, reactions)
    reaction-tool.ts    the reaction MCP tool and the 73 emoji Telegram takes
    html.ts             model Markdown -> Telegram HTML
    ids.ts              chat/message id facts and citation links
    media/              download, detect, sample frames, normalize

  inbound/              reading a Telegram update into the contract
    normalize.ts        one platform update becomes one InboundMessage
    addressing.ts       the structural verdict, per receiving bot
```

Tests sit beside what they cover.

## The interface

Everything this package implements comes from
[`@assistants-swarm-hub/transport-sdk`][sdk]: the descriptor, adapter,
normalizer and addressing types, the runtime a tool receives, and the few
helpers a transport's own tools call. The SDK is a **peer** dependency, and
its major is the compatibility contract: the core you are installed into
checks the range this package declares against the SDK it was built with and
refuses a mismatch by name, with a reason its dashboard shows.

## Development

```bash
npm install         # needs the GitHub Packages token above
npm run typecheck
npm run test        # the seams worth pinning: one event per update, the
                    # addressing verdicts, the html rendering
npm run build       # dist/index.js, what the core imports
```

Against a core checkout next door, link this package into it and restart the
core — a transport is boot-time, so a change needs a restart to show:

```bash
npm link
cd ../ash-core && npm link @assistants-swarm-hub/ash-transport-telegram --no-save
```

Note that `npm install` in the core prunes anything in its `node_modules` that
its manifest does not list — a link included — so link again after one.

Releases: bump `version` in `package.json`, push to `main`, and the workflow
typechecks, tests, builds, publishes the package on that version, installs it
back from the registry to prove it imports, and tags the commit.

## A note on the comments

This code was extracted from the core repository, where it lived as `apps/tg`,
and then ran for a while as its own service. Comments citing "Phase N", "v1"
or a dated decision refer to that history: the reasoning still holds, and the
record is in [assistants-swarm-hub/ash-core][core].

[core]: https://github.com/assistants-swarm-hub/ash-core
[manual]: https://github.com/assistants-swarm-hub/ash-core/blob/main/docs/development/adding-a-transport.md
[sdk]: https://github.com/assistants-swarm-hub/ash-core/blob/main/packages/transport-sdk/README.md

# OpenClaw MAX Plugin — Development Instructions

You are building an OpenClaw channel plugin for the MAX messenger (formerly VK Teams).

## Key References (in this repo)

- `PLAN.md` — Full development plan with architecture, file structure, phases
- `COMPARISON.md` — MAX Bot API vs Telegram comparison

## External References

- MAX Bot API docs: https://dev.max.ru/docs-api/
- MAX TS client: https://github.com/max-messenger/max-bot-api-client-ts (npm: @maxhub/max-bot-api)
- OpenClaw plugin docs: https://docs.openclaw.ai/tools/plugin
- OpenClaw plugin manifest: https://docs.openclaw.ai/plugins/manifest
- Mattermost plugin (reference implementation): study it at ~/.npm-global/lib/node_modules/openclaw/extensions/mattermost/

## What To Build (Phase 0 + Phase 1)

### Phase 0: Scaffolding
1. Create proper `package.json` with openclaw metadata (see PLAN.md section 2)
2. Create `openclaw.plugin.json` manifest
3. Create `tsconfig.json` for TypeScript
4. Create `index.ts` entry point
5. Install dependencies: `@maxhub/max-bot-api` as dependency, `openclaw` as peer dependency

### Phase 1: MVP — Text Messages Working
Build the core plugin so it can:
1. Connect to MAX Bot API via long polling (GET /updates)
2. Receive text messages and route them to OpenClaw agent
3. Send text replies back via POST /messages (with HTML/Markdown formatting)
4. Handle inline keyboard buttons and callbacks
5. Support DM and group chat types
6. Implement typing indicator (POST /chats/{chatId}/actions)
7. Health check via GET /me (probe)
8. Register bot commands via PATCH /me at startup
9. Basic access control (dmPolicy, allowFrom, groupPolicy)

### Architecture Requirements
- Follow the EXACT same pattern as the Mattermost plugin (study ~/.npm-global/lib/node_modules/openclaw/extensions/mattermost/)
- Export a ChannelPlugin object from src/channel.ts
- Use `openclaw/plugin-sdk` imports (specifically `openclaw/plugin-sdk/core` for generic APIs)
- Plugin id: "max", channel id: "max"
- Implement: config.listAccountIds, config.resolveAccount, config.isConfigured, config.describeAccount
- Implement: security.resolveDmPolicy, security.collectWarnings
- Implement: outbound.sendText, outbound.sendMedia, outbound.resolveTarget, outbound.chunker
- Implement: gateway.startAccount (launches the polling monitor)
- Implement: status.probeAccount, status.buildAccountSnapshot

### Important Notes
- MAX API rate limit: 30 rps total — implement basic throttling
- MAX text limit: 4000 chars (use as textChunkLimit)
- MAX edit limit: 24 hours
- No reactions API in MAX — use typing indicator for ack
- Use `notify: false` for silent messages
- Use `disable_link_preview` for link preview control
- Commands via `PATCH /me` with `commands` field (max 32)

## After Completion
Commit all files, push to origin. Then run:
```
openclaw system event --text "Done: OpenClaw MAX plugin Phase 0+1 complete — scaffolding + MVP with text messaging, inline buttons, typing, commands, probe" --mode now
```

# Changelog

## 1.0.0 (2026-03-08)

First stable release of the OpenClaw MAX messenger plugin.

### Features
- **Text messaging** — send and receive text messages in DMs and group chats
- **Media support** — images, videos, audio, files, stickers, contacts, locations
- **Inline keyboard buttons** — send buttons with callback handling
- **Link previews** — share attachments automatically parsed
- **Long polling mode** — reliable message delivery via MAX Bot API polling
- **Webhook mode** — alternative delivery via HTTP webhooks
- **Message chunking** — automatic splitting of long messages
- **Media upload** — two-step upload flow (get URL → upload file → attach token)
- **Edit & delete** — edit and delete bot messages via MAX API
- **Pairing support** — DM access control with OpenClaw pairing system
- **Multi-account** — support for multiple bot accounts
- **Bot commands** — automatic registration of bot commands with MAX

### Bug Fixes
- Fixed API base URL (`botapi.max.ru` instead of `api.max.ru`)
- Fixed authentication (query parameter `access_token` instead of Bearer header)
- Fixed callback `chat_id` resolution with userId→chatId cache + `user_id` fallback
- Fixed stale-socket restarts by reporting poll activity to health-monitor
- Fixed plugin id mismatch warning (package name matches manifest id)

### Package
- npm: `@nixprosoft/max`
- Plugin id: `max`
- Config key: `channels.max`

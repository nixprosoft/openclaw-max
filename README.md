# openclaw-max

OpenClaw channel plugin for [MAX messenger](https://max.ru) (formerly VK Teams).

Enables your OpenClaw AI assistant to send and receive messages via MAX Bot API — supporting DMs, group chats, inline keyboard buttons, media attachments, and both long-polling and webhook modes.

---

## Requirements

### Russian legal entity required

MAX bots can only be created by verified Russian businesses. You must have a **Russian legal entity** (ИП or юрлицо) registered in the MAX Business platform before you can create a bot.

See: [MAX Business connection guide](https://dev.max.ru/docs/maxbusiness/connection)

### Create your bot

Create a bot by messaging **@masterbot** in MAX (not @metabot — that is a different service).

@masterbot will guide you through the bot registration process and provide a bot token in the format:

```
001.0123456789.0123456789:ABCdef...
```

---

## Installation

### Via npm (recommended)

```bash
openclaw plugins install @nixprosoft/openclaw-max
```

### From local path (development)

```bash
openclaw plugins install /path/to/openclaw-max
```

---

## Configuration

Add a `channels.max` section to your OpenClaw config file (`~/.openclaw/config.yml` or `openclaw.config.yml`):

### Minimal (polling mode)

```yaml
channels:
  max:
    enabled: true
    botToken: "001.0123456789.0123456789:ABCdef"
```

Or via environment variable (default account only):

```bash
export MAX_BOT_TOKEN="001.0123456789.0123456789:ABCdef"
```

### Full configuration example

```yaml
channels:
  max:
    enabled: true
    botToken: "001.0123456789.0123456789:ABCdef"

    # Connection mode: "polling" (default) or "webhook"
    mode: polling

    # MAX Bot API base URL (default: https://api.max.ru)
    # apiBaseUrl: https://api.max.ru

    # Message format: "markdown" (default) or "html"
    format: markdown

    # Show typing indicator while the AI generates a response (default: true)
    typingIndicator: true

    # Send messages with notification sound (default: true)
    notify: true

    # Maximum text chunk size in characters (default: 4000)
    textChunkLimit: 4000

    # Maximum media file size in MB (default: 50)
    mediaMaxMb: 50

    # Direct message policy: "pairing" (default), "open", or "disabled"
    dmPolicy: pairing

    # Allow-list for DMs (user IDs). Required when dmPolicy="open"
    # allowFrom:
    #   - "123456789"
    #   - "*"     # allow everyone

    # Group message policy: "allowlist" (default), "open", or "disabled"
    groupPolicy: allowlist

    # Allow-list for group messages (user IDs)
    # groupAllowFrom:
    #   - "123456789"

    # Bot commands to register at startup (max 32)
    commands:
      - name: start
        description: Start a conversation
      - name: help
        description: Show help
```

---

## Webhook mode

To use webhook mode instead of long-polling, set `mode: webhook` and configure the webhook URL. MAX will POST updates to your URL, which requires your OpenClaw instance to be publicly reachable.

```yaml
channels:
  max:
    enabled: true
    botToken: "001.0123456789.0123456789:ABCdef"
    mode: webhook

    # Public URL MAX will POST updates to
    webhookUrl: "https://yourdomain.example.com/max-webhook"

    # Optional: verify incoming requests with a shared secret
    # MAX sends this in the X-Max-Bot-Api-Secret header
    webhookSecret: "your-secret-here"

    # Local HTTP server settings (OpenClaw listens on these)
    webhookPath: /max-webhook      # default
    webhookHost: 127.0.0.1         # default
    webhookPort: 8788              # default
```

In webhook mode the plugin registers a local HTTP route, subscribes the webhook with MAX on startup, and unsubscribes cleanly on shutdown.

---

## Access control

### Direct messages (dmPolicy)

| Value | Behavior |
|-------|----------|
| `pairing` | (default) Unknown users get a pairing code; the owner approves them |
| `open` | Anyone can DM the bot (requires `allowFrom: ["*"]`) |
| `disabled` | No DMs accepted |

To approve a pairing request:

```bash
openclaw pairing list max
openclaw pairing approve max <code>
```

### Group messages (groupPolicy)

| Value | Behavior |
|-------|----------|
| `allowlist` | (default) Only users in `groupAllowFrom` can trigger the bot |
| `open` | Any group member can trigger the bot (mention required) |
| `disabled` | Bot does not respond in groups |

In group chats, users must @mention the bot to trigger a response.

### Per-group configuration

```yaml
channels:
  max:
    groups:
      "123456789":          # chatId of the group
        requireMention: true  # default: true
        enabled: true
```

---

## Multi-account setup

To run multiple MAX bots from the same OpenClaw instance:

```yaml
channels:
  max:
    enabled: true
    # Default account settings (shared base)
    format: markdown

    accounts:
      work-bot:
        enabled: true
        botToken: "001.111111111.111111111:WorkToken"
        dmPolicy: open
        allowFrom: ["*"]

      customer-bot:
        enabled: true
        botToken: "001.222222222.222222222:CustomerToken"
        dmPolicy: pairing
        groupPolicy: disabled
```

Use `--account work-bot` in OpenClaw CLI commands to target a specific account.

---

## Supported features

| Feature | Status |
|---------|--------|
| Text messages (DM) | ✅ |
| Text messages (group/channel) | ✅ |
| Typing indicator | ✅ |
| Inline keyboard buttons | ✅ |
| Button callbacks | ✅ |
| Image / video / audio / file attachments | ✅ |
| Reply-to (message threading) | ✅ |
| Webhook mode | ✅ |
| Long-polling mode | ✅ |
| Bot commands registration | ✅ |
| DM pairing flow | ✅ |
| Multi-account | ✅ |
| Message edit / delete | ✅ (outbound) |
| HTML or Markdown formatting | ✅ |

## Unsupported features

| Feature | Notes |
|---------|-------|
| Reactions | MAX Bot API does not expose a reactions endpoint |
| Polls | Not available in MAX Bot API |
| Video notes (circles) | Not available in MAX Bot API |
| Live location | Not supported |
| Sticker sending | Stickers are received as attachments but cannot be sent |

---

## Troubleshooting

### Bot token is invalid / 401 error

- Verify the token was copied correctly from @masterbot
- Tokens look like: `001.0123456789.0123456789:ABCdef...`
- Make sure there are no extra spaces or line breaks

### Bot doesn't respond to DMs

- Check `dmPolicy` — default is `pairing`, meaning unknown users need approval first
- Run `openclaw pairing list max` to see pending requests
- Approve with `openclaw pairing approve max <code>`

### Bot doesn't respond in groups

- The bot must be added to the group
- Users must @mention the bot (e.g. `@mybotusername what is the weather?`)
- Check `groupPolicy` — default is `allowlist`, meaning only approved user IDs can trigger it
- Add user IDs to `groupAllowFrom` or set `groupPolicy: open`

### Webhook mode not receiving updates

- Ensure your public `webhookUrl` is reachable from the internet
- Check that `webhookPath` matches the path in `webhookUrl`
- Verify `webhookSecret` matches on both ends if configured
- Check OpenClaw logs for subscription errors

### Rate limit errors (429)

MAX has a global rate limit of 30 requests/second. The plugin automatically retries with backoff on rate limit responses. If you hit sustained limits, reduce the frequency of outbound messages.

### Connection keeps dropping

- The plugin uses exponential backoff (up to 60 seconds) when polling fails
- Check your network connectivity and MAX API availability
- Inspect logs: `openclaw logs` for detailed error messages

---

## Links

- [MAX Bot API documentation](https://dev.max.ru/docs-api/)
- [MAX Business registration](https://dev.max.ru/docs/maxbusiness/connection)
- [OpenClaw plugin documentation](https://docs.openclaw.ai/tools/plugin)
- [OpenClaw plugin manifest](https://docs.openclaw.ai/plugins/manifest)
- [MAX Bot API TypeScript client](https://github.com/max-messenger/max-bot-api-client-ts)

---

## License

MIT

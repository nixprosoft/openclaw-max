# Contributing to openclaw-max

Thanks for your interest in contributing! 🖤

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/openclaw-max.git
   cd openclaw-max
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Link the plugin to your OpenClaw instance:
   ```bash
   openclaw plugins install --link .
   ```
5. Configure the channel in your OpenClaw config:
   ```json
   {
     "channels": {
       "max": {
         "enabled": true,
         "botToken": "YOUR_MAX_BOT_TOKEN",
         "mode": "polling"
       }
     }
   }
   ```
6. Restart the gateway: `openclaw gateway restart`

## Development

- TypeScript source is in `src/`
- OpenClaw loads `.ts` files directly — no build step needed
- Check for errors: `npx tsc --noEmit`

## Creating a MAX Bot

1. Open MAX messenger and find **@metabot**
2. Send `/create` to create a new bot
3. Copy the bot token

## Submitting Changes

1. Create a feature branch: `git checkout -b my-feature`
2. Make your changes
3. Verify no TS errors: `npx tsc --noEmit`
4. Test with a real OpenClaw instance
5. Commit with a descriptive message
6. Push and open a Pull Request

## Reporting Bugs

Use the [Bug Report template](https://github.com/nixprosoft/openclaw-max/issues/new?template=bug_report.md). Include logs from:
```bash
journalctl --user -u openclaw-gateway | grep max
```

## Code Style

- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Add `[max] [debug]` prefixed log messages for debugging
- Keep functions focused and well-typed

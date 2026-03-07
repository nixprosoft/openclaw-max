# План разработки: OpenClaw MAX Channel Plugin

> **Репозиторий:** `github.com/nixprosoft/openclaw-max`
> **npm пакет:** `@nixprosoft/openclaw-max`
> **Статус:** Планирование

---

## 1. Архитектура плагина

### Структура проекта

```
openclaw-max/
├── package.json                    # npm пакет с openclaw.extensions + channel metadata
├── openclaw.plugin.json            # Манифест плагина (id, channels, configSchema)
├── index.ts                        # Точка входа: export default plugin
├── tsconfig.json
├── README.md
├── LICENSE (MIT)
├── src/
│   ├── channel.ts                  # ChannelPlugin<ResolvedMaxAccount> — главный объект
│   ├── config-schema.ts            # JSON Schema для конфигурации channels.max
│   ├── types.ts                    # Типы: MaxAccountConfig, ResolvedMaxAccount, etc.
│   ├── normalize.ts                # Нормализация target IDs, allowFrom entries
│   ├── runtime.ts                  # Runtime holder (api.runtime)
│   ├── max/
│   │   ├── client.ts              # HTTP-клиент для MAX Bot API (обёртка над @maxhub/max-bot-api или raw fetch)
│   │   ├── accounts.ts            # Резолв аккаунтов из конфига (multi-account)
│   │   ├── monitor.ts             # Главный polling/webhook loop
│   │   ├── monitor-polling.ts     # Long polling через GET /updates
│   │   ├── monitor-webhook.ts     # Webhook через POST /subscriptions + HTTP route
│   │   ├── send.ts                # Отправка сообщений (POST /messages)
│   │   ├── edit.ts                # Редактирование (PUT /messages)
│   │   ├── delete.ts              # Удаление (DEL /messages)
│   │   ├── upload.ts              # Загрузка медиа (POST /uploads → token)
│   │   ├── actions.ts             # Typing indicator, pin/unpin
│   │   ├── commands.ts            # Регистрация команд бота (PATCH /me)
│   │   ├── callbacks.ts           # Обработка callback от inline-кнопок (POST /answers)
│   │   ├── streaming.ts           # Partial streaming через editText
│   │   └── probe.ts               # Health check (GET /me)
│   ├── inbound/
│   │   ├── normalize-event.ts     # Нормализация MAX events → OpenClaw envelope
│   │   ├── attachments.ts         # Обработка вложений (image/video/audio/file/sticker)
│   │   └── mentions.ts            # Детекция mention бота
│   └── outbound/
│       ├── format.ts              # Форматирование текста (Markdown/HTML → MAX format)
│       └── buttons.ts             # Построение inline_keyboard attachment
└── test/
    ├── send.test.ts
    ├── normalize.test.ts
    ├── monitor.test.ts
    └── fixtures/                  # Примеры JSON событий от MAX API
```

### Зависимости

```json
{
  "dependencies": {
    "@maxhub/max-bot-api": "latest"
  },
  "peerDependencies": {
    "openclaw": ">=2026.2.0"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vitest": "^3.0"
  }
}
```

> **Решение:** использовать `@maxhub/max-bot-api` как зависимость (аналогично grammY для Telegram). Если клиент окажется неподходящим по архитектуре — fallback на raw fetch + собственные типы.

---

## 2. Файлы манифеста

### openclaw.plugin.json

```json
{
  "id": "max",
  "name": "MAX Messenger",
  "description": "OpenClaw channel plugin for MAX (formerly VK Teams) messenger",
  "version": "0.1.0",
  "channels": ["max"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

### package.json (ключевые поля)

```json
{
  "name": "@nixprosoft/openclaw-max",
  "version": "0.1.0",
  "description": "OpenClaw channel plugin for MAX messenger",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "max",
      "label": "MAX",
      "selectionLabel": "MAX Messenger (plugin)",
      "docsPath": null,
      "docsLabel": "max",
      "blurb": "Russian messenger MAX (formerly VK Teams) via Bot API.",
      "order": 70,
      "aliases": ["max-messenger", "vk-teams"]
    },
    "install": {
      "npmSpec": "@nixprosoft/openclaw-max",
      "defaultChoice": "npm"
    }
  }
}
```

---

## 3. Конфигурация пользователя

Плагин добавит секцию `channels.max` в конфигурацию OpenClaw:

```json5
{
  channels: {
    max: {
      enabled: true,
      botToken: "001.0123456789.0123456789:ABCdef",
      // или tokenFile: "/path/to/token"

      // Подключение
      apiBaseUrl: "https://api.max.ru",  // по умолчанию
      mode: "polling",                    // "polling" | "webhook"
      
      // Webhook (если mode: "webhook")
      webhookUrl: "https://my-server.com/max-webhook",
      webhookSecret: "...",
      webhookPath: "/max-webhook",
      webhookHost: "127.0.0.1",
      webhookPort: 8788,

      // Доступ
      dmPolicy: "pairing",    // pairing | allowlist | open | disabled
      allowFrom: [],           // user IDs
      groupPolicy: "allowlist",
      groupAllowFrom: [],

      // Группы
      groups: {
        "<chatId>": {
          requireMention: true,
          groupPolicy: "open",
          allowFrom: [],
          systemPrompt: "",
          enabled: true
        }
      },

      // Сообщения
      textChunkLimit: 4000,
      format: "markdown",      // "markdown" | "html"
      streaming: "partial",    // "off" | "partial"
      notify: true,            // default notification setting

      // Медиа
      mediaMaxMb: 50,

      // Действия агента
      actions: {
        sendMessage: true,
        editMessage: true,
        deleteMessage: true
      },

      // Команды
      commands: [],  // BotCommand[] для PATCH /me

      // Multi-account
      accounts: {
        "second-bot": {
          botToken: "...",
          apiBaseUrl: "...",
          // ... все те же поля
        }
      }
    }
  }
}
```

---

## 4. Маппинг событий MAX → OpenClaw

| MAX Event | OpenClaw Envelope | Обработка |
|---|---|---|
| `message_created` | `inbound.message` | Текст + attachments → content. chatType из chat.type |
| `message_edited` | `inbound.messageEdit` | Уведомление агента об изменении |
| `message_removed` | `inbound.messageDelete` | Уведомление агента |
| `message_callback` | `inbound.callback` | callback_data → агенту как текст |
| `bot_started` | `inbound.botStart` | Аналог Telegram /start, создание сессии |
| `bot_added` | `inbound.botAdded` | Бот добавлен в чат |
| `bot_removed` | Остановка мониторинга чата | — |
| `user_added` | `inbound.memberJoin` | Для контекста |
| `user_removed` | `inbound.memberLeave` | Для контекста |
| `chat_title_changed` | `inbound.chatUpdate` | Обновление metadata |

### Маппинг вложений (Inbound)

| MAX Attachment | OpenClaw Media | Обработка |
|---|---|---|
| `image` | `<media:image>` | Скачивание по URL из payload |
| `video` | `<media:video>` | Скачивание |
| `audio` | `<media:audio>` | Скачивание |
| `file` | `<media:document>` | Скачивание |
| `sticker` | `<media:sticker>` | URL + описание через vision (кеш) |
| `location` | metadata | Широта/долгота → текст |
| `contact` | metadata | Имя + контактные данные → текст |
| `share` | metadata | URL ссылки → контекст |
| `inline_keyboard` | buttons metadata | Для контекста |

---

## 5. Маппинг исходящих действий

| OpenClaw Action | MAX API | Детали |
|---|---|---|
| `sendText` | `POST /messages` | body.text, format, link (reply/forward), notify, disable_link_preview |
| `sendMedia` | `POST /uploads` → `POST /messages` | 1) Upload file → get token 2) Send с attachment token |
| `editMessage` | `PUT /messages` | message_id, text, format. **Ограничение: 24 часа** |
| `deleteMessage` | `DEL /messages` | message_id |
| `react` | ❌ Не поддерживается | Fallback: typing indicator или текстовое подтверждение |
| `sendPoll` | ❌ Не поддерживается | Fallback: inline-кнопки |
| `typing` | `POST /chats/{chatId}/actions` | action: "typing" |
| `setCommands` | `PATCH /me` | commands: BotCommand[] при старте |
| `answerCallback` | `POST /answers` | callback_id, text, notification |

---

## 6. Стриминг

MAX не поддерживает нативные черновики. Реализация streaming:

```
1. Получение сообщения пользователя
2. POST /chats/{chatId}/actions → typing      (вместо ack 👀)
3. POST /messages → preview message            (первые N символов)
4. PUT /messages → обновление preview          (по мере генерации)
5. PUT /messages → финальное сообщение         (полный текст)
```

**Throttling:** не чаще 1 edit в 300-500ms (чтобы не упереться в rate limit 30 rps).

**Режимы:**
- `off` — отправить только финальный текст
- `partial` — typing + edit preview

---

## 7. Фазы разработки

### Фаза 0: Скаффолдинг (1 день)

- [ ] Создать репозиторий `nixprosoft/openclaw-max` на GitHub
- [ ] Инициализировать проект: package.json, tsconfig, openclaw.plugin.json
- [ ] Установить зависимости: `@maxhub/max-bot-api`, `openclaw` (peer), `vitest`
- [ ] Создать index.ts с базовой структурой плагина
- [ ] Настроить CI (GitHub Actions): lint + typecheck + test

### Фаза 1: MVP — текстовые сообщения (2-3 дня)

- [ ] `src/types.ts` — типы конфигурации MaxAccountConfig
- [ ] `src/config-schema.ts` — JSON Schema
- [ ] `src/max/accounts.ts` — резолв аккаунтов
- [ ] `src/max/client.ts` — базовый HTTP-клиент (или обёртка @maxhub/max-bot-api)
- [ ] `src/max/monitor-polling.ts` — long polling через `GET /updates`
- [ ] `src/max/monitor.ts` — основной loop обработки событий
- [ ] `src/inbound/normalize-event.ts` — `message_created` → OpenClaw envelope
- [ ] `src/inbound/mentions.ts` — детекция @bot
- [ ] `src/max/send.ts` — `POST /messages` (текст + inline keyboard)
- [ ] `src/max/callbacks.ts` — `POST /answers` для callback
- [ ] `src/max/probe.ts` — `GET /me` health check
- [ ] `src/channel.ts` — ChannelPlugin объект (config, security, outbound, gateway)
- [ ] Тесты: отправка, нормализация, probe
- [ ] **Milestone: бот отвечает на текстовые сообщения в MAX**

### Фаза 2: Медиа + команды (2 дня)

- [ ] `src/max/upload.ts` — `POST /uploads` (resumable upload)
- [ ] `src/inbound/attachments.ts` — обработка входящих медиа
- [ ] `src/outbound/format.ts` — форматирование Markdown/HTML
- [ ] `src/outbound/buttons.ts` — построение inline_keyboard
- [ ] `src/max/commands.ts` — `PATCH /me` для регистрации команд при старте
- [ ] `src/max/edit.ts` — `PUT /messages`
- [ ] `src/max/delete.ts` — `DEL /messages`
- [ ] `src/max/actions.ts` — typing indicator, pin/unpin
- [ ] Тесты: upload flow, format, attachments
- [ ] **Milestone: полная работа с медиа, кнопками, командами**

### Фаза 3: Streaming + Webhook (1-2 дня)

- [ ] `src/max/streaming.ts` — partial streaming через edit
- [ ] `src/max/monitor-webhook.ts` — webhook mode
  - `api.registerHttpRoute()` для входящих webhook запросов
  - `POST /subscriptions` для регистрации при старте
  - Верификация `X-Max-Bot-Api-Secret`
  - `DEL /subscriptions` при остановке
- [ ] Throttling для streaming edits (300-500ms)
- [ ] Тесты: streaming, webhook verification
- [ ] **Milestone: streaming работает, webhook как альтернатива polling**

### Фаза 4: Полировка + публикация (1-2 дня)

- [ ] `src/normalize.ts` — нормализация targets для CLI (`openclaw message send --channel max`)
- [ ] Multi-account support
- [ ] Pairing flow (DM policy)
- [ ] README.md с инструкциями
  - Создание бота в MAX
  - Настройка конфигурации
  - Примеры использования
- [ ] Error handling + retry logic
- [ ] `openclaw doctor` integration (status, probe)
- [ ] Публикация на npm: `npm publish --access public`
- [ ] Тег v0.1.0 на GitHub
- [ ] **Milestone: плагин опубликован и устанавливается через `openclaw plugins install @nixprosoft/openclaw-max`**

---

## 8. Ключевые технические решения

### 8.1. Клиент API

**Вариант A (рекомендуемый):** Использовать `@maxhub/max-bot-api` как зависимость.
- ✅ Готовые типы TypeScript
- ✅ Middleware-архитектура знакомая по grammY
- ⚠️ Нужно убедиться что пакет не требует postinstall builds

**Вариант B (fallback):** Raw fetch + собственные типы.
- ✅ Полный контроль
- ❌ Больше кода

### 8.2. Ack без реакций

Telegram-канал использует emoji-реакцию 👀 как acknowledgement. В MAX:
- При получении сообщения: `POST /chats/{chatId}/actions` → typing
- Typing автоматически исчезает после отправки ответа
- Опционально: отправить "⏳" сообщение → удалить после ответа (слишком шумно, не рекомендуется)

### 8.3. Rate limiting

MAX имеет общий лимит **30 rps на весь API**. Нужен:
- Глобальный rate limiter (token bucket)
- Приоритизация: send > edit > typing > upload
- Backoff при 429

### 8.4. Загрузка медиа

Двухшаговый процесс:
```
1. POST /uploads?type=image → { url: "upload-url" }
2. PUT upload-url (body: file) → { token: "..." }
3. POST /messages { attachments: [{ type: "image", payload: { token: "..." } }] }
```
Для больших файлов (>100MB) — resumable upload.

### 8.5. Session isolation

- DM: по `chat.chatId` (тип `dialog`)
- Группа: по `chat.chatId` (тип `chat`/`channel`)
- Нет форум-топиков — изоляция только по chatId

---

## 9. Тестирование

| Уровень | Что тестируем | Инструмент |
|---|---|---|
| Unit | Нормализация событий, форматирование, chunking | vitest |
| Unit | Config schema validation | vitest + JSON Schema |
| Integration | Polling loop с mock API | vitest + msw |
| Integration | Webhook handler | vitest + supertest |
| E2E | Реальный бот в MAX | Ручное тестирование |

---

## 10. Референсы

- **Mattermost plugin** (bundled): `~/.npm-global/lib/node_modules/openclaw/extensions/mattermost/` — основной референс по структуре ChannelPlugin
- **Plugin docs:** https://docs.openclaw.ai/tools/plugin
- **Plugin manifest:** https://docs.openclaw.ai/plugins/manifest
- **MAX Bot API docs:** https://dev.max.ru/docs-api/
- **MAX TS client:** https://github.com/max-messenger/max-bot-api-client-ts
- **MAX Bot API comparison:** `max-bot-api-comparison.md` (в этом workspace)

---

## 11. Оценка сроков

| Фаза | Срок | Результат |
|---|---|---|
| Фаза 0: Скаффолдинг | 1 день | Проект создан, CI настроен |
| Фаза 1: MVP | 2-3 дня | Текстовые сообщения работают |
| Фаза 2: Медиа + команды | 2 дня | Полная функциональность |
| Фаза 3: Streaming + Webhook | 1-2 дня | Streaming и webhook |
| Фаза 4: Полировка + публикация | 1-2 дня | npm publish |
| **Итого** | **7-10 дней** | **Готовый плагин на npm** |

---

## ⚠️ Требования для создания бота в MAX

Создание бота в MAX доступно **только для юридических лиц и ИП — резидентов РФ**.

**Не могут создать бота:** самозанятые, физические лица, нерезиденты РФ.

### Процесс:
1. Зарегистрироваться на [business.max.ru](https://business.max.ru/self) (по номеру телефона + SMS)
2. Создать профиль организации (ввести ИНН)
3. Пройти верификацию через Госуслуги, Alfa ID, Т-Business ID или СберБизнес ID
4. Выбрать сервис → Чат-бот → получить токен через @masterbot
5. Верификацию может пройти только владелец организации (единоличный исполнительный орган) или представитель с правом первой подписи

**Источник:** https://dev.max.ru/docs/maxbusiness/connection

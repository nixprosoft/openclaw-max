# Сравнение: Telegram-канал OpenClaw vs MAX Bot API

## Контекст

**MAX** (ранее VK Teams / myteam.mail.ru) — российский мессенджер с Bot API. Официальная документация: [dev.max.ru/docs-api](https://dev.max.ru/docs-api/). Также существует зрелый TypeScript-клиент [`@maxhub/max-bot-api`](https://github.com/max-messenger/max-bot-api-client-ts) в стиле grammY.

---

## Полный список методов MAX Bot API

| Категория | Метод | Описание |
|-----------|-------|----------|
| **Bots** | `GET /me` | Информация о боте (включая `commands`) |
| | `PATCH /me` | Редактирование бота (имя, описание, фото, **команды**) |
| **Messages** | `POST /messages` | Отправка сообщения (текст, медиа, attachments, inline_keyboard) |
| | `PUT /messages` | Редактирование сообщения (ограничение: 24 часа) |
| | `DEL /messages` | Удаление сообщений |
| | `GET /messages` | Получение сообщений |
| | `GET /messages/{messageId}` | Конкретное сообщение |
| | `GET /messages/{messageId}/video-info` | Информация о видео |
| | `POST /answers` | Ответ на callback от inline-кнопок |
| **Chats** | `GET /chats` | Список групповых чатов |
| | `GET /chats/{chatId}` | Информация о чате |
| | `PATCH /chats/{chatId}` | Изменение чата (название, описание) |
| | `DEL /chats/{chatId}` | Удаление чата |
| | `POST /chats/{chatId}/actions` | Отправка действий (typing и т.д.) |
| | `GET /chats/{chatId}/pin` | Получение закреплённого сообщения |
| | `PUT /chats/{chatId}/pin` | Закрепление сообщения |
| | `DEL /chats/{chatId}/pin` | Открепление |
| | `GET /chats/{chatId}/membership` | Членство бота в чате |
| | `DEL /chats/{chatId}/membership` | Покинуть чат |
| | `GET /chats/{chatId}/admins` | Список администраторов |
| | `POST /chats/{chatId}/admins` | Назначение админа |
| | `DEL /chats/{chatId}/admins` | Снятие прав админа |
| | `GET /chats/{chatId}/members` | Участники чата |
| | `POST /chats/{chatId}/members` | Добавление участников |
| | `DEL /chats/{chatId}/members` | Удаление участника |
| **Subscriptions** | `GET /subscriptions` | Список webhook-подписок |
| | `POST /subscriptions` | Создание webhook-подписки |
| | `DEL /subscriptions` | Удаление подписки |
| **Updates** | `GET /updates` | Long polling |
| **Upload** | `POST /uploads` | Загрузка файлов (image/video/audio/file, до 4 ГБ, resumable) |

### Типы событий (webhook / long polling)

| Тип события | Описание |
|---|---|
| `message_created` | Новое сообщение |
| `message_edited` | Сообщение отредактировано |
| `message_removed` | Сообщение удалено |
| `message_callback` | Нажатие inline-кнопки (callback) |
| `bot_started` | Пользователь запустил бота |
| `bot_added` | Бот добавлен в чат |
| `bot_removed` | Бот удалён из чата |
| `user_added` | Пользователь добавлен в чат |
| `user_removed` | Пользователь удалён из чата |
| `chat_title_changed` | Название чата изменено |
| `message_construction_request` | Запрос на конструирование сообщения |
| `message_constructed` | Сообщение сконструировано |
| `message_chat_created` | Чат создан через сообщение |

### Типы вложений (Attachments)

`image`, `video`, `audio`, `file`, `sticker`, `contact`, `share` (link preview), `location`, `inline_keyboard`

### Типы чатов

`dialog` (DM), `chat` (группа), `channel`

---

## 1. Таблица сравнения

| Функция OpenClaw Telegram | MAX API | Метод MAX | Комментарий |
|---|---|---|---|
| **ВХОДЯЩИЕ** | | | |
| Текстовые сообщения (DM + группы) | ✅ | `GET /updates` → `message_created` | Полный аналог. dialog/chat/channel |
| Медиа (фото, видео, документы) | ✅ | attachment types: image/video/audio/file | Через attachments в событии |
| Голосовые сообщения | ✅ | attachment + audio type | Аналогично |
| Стикеры (получение) | ✅ | attachment type `sticker` | `StickerAttachment`: url, code, width, height |
| Реакции пользователей | ❌ | — | Нет события реакций в Bot API |
| Callback от inline-кнопок | ✅ | `message_callback` | Полный аналог |
| Форум-топики (изоляция сессий) | ⚠️ | — | Нет прямого аналога. Треды нет в текущем API |
| Media groups | ❌ | — | Нет группировки медиа |
| Reply threading (quote) | ✅ | `link` с type `reply` | Есть reply как часть сообщения |
| Mention detection | ✅ | attachment/text mention | Нативные mention |
| Forward detection | ✅ | `link` с type `forward` | Есть forward |
| Edited message events | ✅ | `message_edited` | Аналог |
| Deleted message events | ✅ | `message_removed` | Аналог |
| Bot added/removed events | ✅ | `bot_added` / `bot_removed` | Аналог |
| Member join/leave | ✅ | `user_added` / `user_removed` | Аналог |
| Chat info changed | ✅ | `chat_title_changed` | Аналог |
| Bot started | ✅ | `bot_started` | Аналог `/start` в Telegram |
| **ИСХОДЯЩИЕ** | | | |
| sendMessage (HTML, chunking) | ✅ | `POST /messages` | HTML + Markdown. Лимит 4000 символов (TG: 4096). Chunking на стороне плагина |
| editMessage | ✅ | `PUT /messages` | Ограничение: **24 часа** (TG: 48ч) |
| deleteMessage | ✅ | `DEL /messages` | Аналог |
| sendSticker | ❓ | — | Тип `sticker` есть в attachment, но **отправка ботом не документирована** |
| react (emoji-реакции) | ❌ | — | Нет API для реакций ботами |
| sendPoll (опросы) | ❌ | — | Нет метода для опросов |
| Inline keyboard buttons | ✅ | attachment `inline_keyboard` | До 210 кнопок (30 рядов × 7), 6 типов кнопок |
| createForumTopic | ❌ | — | Нет прямого аналога |
| Медиа-отправка | ✅ | `POST /uploads` → `POST /messages` | Двухшаговый: загрузка → отправка с token. До 4 ГБ, resumable |
| Voice notes | ✅ | `POST /uploads` (audio) | Через загрузку аудио |
| Video notes | ❌ | — | Нет отдельного типа |
| Silent messages | ✅ | `notify: false` в `POST /messages` | Полный аналог `disable_notification` |
| Reply threading tags | ✅ | `link` с type `reply` в body | Аналог |
| Link preview control | ✅ | `disable_link_preview` в `POST /messages` | Управление превью ссылок |
| answerCallbackQuery | ✅ | `POST /answers` | Полный аналог (text, notification) |
| Typing indicator | ✅ | `POST /chats/{chatId}/actions` | Аналог sendChatAction |
| Forward message | ✅ | `link` с type `forward` в body | Аналог |
| Pin/Unpin | ✅ | `PUT/DEL /chats/{chatId}/pin` | Аналог |
| **СТРИМИНГ** | | | |
| Draft streaming | ❌ | — | Нет нативных черновиков |
| Partial streaming (edit preview) | ⚠️ | `PUT /messages` | Эмуляция через быстрое редактирование |
| Block streaming | ⚠️ | `PUT /messages` | Аналогично — через editText |
| Ack reactions (👀) | ❌ | — | Нет реакций. Замена: typing indicator |
| **ИНФРАСТРУКТУРА** | | | |
| Long polling | ✅ | `GET /updates` | limit 1-1000, timeout 0-90 сек, marker |
| Webhook | ✅ | `POST /subscriptions` | 13 типов событий, secret (`X-Max-Bot-Api-Secret`), retry до 10 раз (60с → ×2.5), автоотписка через 8ч. **Только порт 443, только trusted CA** |
| Proxy (SOCKS/HTTP) | ✅ | Через HTTP-клиент | Стандартно поддерживается |
| Multi-account | ✅ | Через разные токены | Архитектурно поддерживается |
| DM/Group policy | ✅ | dialog/chat/channel types | Фильтрация по типу чата |
| Custom commands menu | ✅ | `PATCH /me` → `commands` | До 32 команд, без scope/локализации (TG: до 100, scope+language) |
| Chat management | ✅ | Полный CRUD `/chats/{chatId}/*` | Расширенное: участники, админы, pin, инфо |
| Config writes из событий | ⚠️ | `bot_added`/`bot_removed` | Базовые события. Нет аналога migrate_to_chat_id |
| Геолокация | ✅ | attachment `location` + кнопка `request_geo_location` | Входящие + запрос геолокации |
| Контакты | ✅ | attachment `contact` + кнопка `request_contact` | VCF-формат |
| Rate limit | ⚠️ | **30 rps** общий | TG: ~30 msg/sec для отправки + специфические лимиты |

---

## 2. Критические недостающие функции + обходные пути

| Недостающая функция | Критичность | Обходной путь |
|---|---|---|
| **Реакции (входящие + исходящие)** | 🟡 Средняя | Ack-реакции (👀) заменить на `typing indicator` через `POST /chats/{chatId}/actions`. Для выразительных реакций — нет обходного пути, но это не критично для основной работы OpenClaw |
| **Стикеры (отправка)** | 🟡 Средняя | Тип `sticker` есть в attachment — **требует тестирования** через `POST /messages` с attachment type sticker |
| **Опросы (polls)** | 🟡 Средняя | Эмулировать inline-кнопками с callback_data для вариантов ответа |
| **Draft streaming** | 🟡 Средняя | Использовать `typing indicator` + `PUT /messages` (edit) для partial streaming |
| **Video notes** | 🟢 Низкая | Отправлять как обычное видео через `POST /uploads` + `POST /messages` |
| **Forum-топики** | 🟡 Средняя | Нет прямого аналога. Изоляция сессий — только по chatId |
| **Media groups** | 🟢 Низкая | Отправлять файлы по одному. Группировку обеспечить буфером на уровне плагина |
| **Custom commands scope/i18n** | 🟢 Низкая | Команды только глобальные, до 32 штук. Для OpenClaw достаточно |
| **Миграция чатов** | 🟢 Низкая | Нет `migrate_to_chat_id`. Маловероятный сценарий |

---

## 3. Итоговая оценка реализуемости плагина

### Оценка: 🟡 СРЕДНЯЯ сложность (ближе к простой)

**Позитивные факторы:**
- ~80% функциональности маппится 1:1 (было ~70% до уточнений)
- **Webhook полностью поддерживается** — модель идентична Telegram
- **Silent messages и Link preview** — поддерживаются (ранее считались отсутствующими)
- **Меню команд** — работает через `PATCH /me`
- Существует зрелый **TypeScript-клиент** `@maxhub/max-bot-api` в стиле grammY — можно использовать как зависимость или референс
- API хорошо документирован ([dev.max.ru](https://dev.max.ru/docs-api/)) + 3 SDK (TypeScript, Python, Go)
- Модель данных (chatId, msgId, attachments) очень похожа на Telegram

**Вызовы:**
- Отсутствие реакций ломает ack-паттерн (👀 → edit → финал), но typing indicator — адекватная замена
- Загрузка медиа — двухшаговый процесс (upload → получить token → отправить) + задержка обработки
- Ограничение 4000 символов (vs 4096 TG) — нужно учесть в chunking
- Редактирование только 24 часа (vs 48ч TG)
- Rate limit 30 rps на **весь** API (включая polling)
- Нет форум-топиков — изоляция сессий только по chatId

### План реализации (ориентировочный)

| Фаза | Содержание | Срок |
|---|---|---|
| **Фаза 1: MVP** | Polling/webhook, текст, файлы, inline-кнопки, callback, typing, silent, commands | **3-4 дня** |
| **Фаза 2: Стриминг** | editText-based streaming, typing indicator вместо ack | **1 день** |
| **Фаза 3: Расширенное** | Медиа-загрузка, chat management, эмуляция poll, link preview control | **2-3 дня** |

**Итого: ~6-8 дней до полноценного плагина, покрывающего ~85% возможностей Telegram-канала.**

### Ключевое преимущество

TypeScript-клиент `@maxhub/max-bot-api` может быть использован как npm-зависимость плагина, что значительно сокращает время на реализацию низкоуровневого API-слоя (аналогично тому, как Telegram-канал OpenClaw использует grammY).

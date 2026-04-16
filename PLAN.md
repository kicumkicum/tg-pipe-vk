# План реализации (по `SPECIFICATION.md`)

Цель: **stateless** двусторонний relay сообщений между **VK Community Chat** и **Telegram group chat** через **Vercel serverless webhooks**, без БД/Redis, без polling/WebSocket, только текст (MVP), без циклов пересылки, с retry при временных ошибках.

---

## Подготовка и каркас проекта

- [x] Выбран формат: **чистые Vercel Functions** (без Next.js)
- [x] Инициализировать Node.js проект с TypeScript
- [x] Настроить базовые скрипты: `dev`, `build` (и `lint` — опционально)
- [x] Добавить зависимости для Vercel Functions:
  - [x] `@vercel/node` (runtime)
  - [x] HTTP-клиент для API вызовов: **нативный `fetch`** (Node 24)
- [x] Подготовить локальную разработку:
  - [x] Установить Vercel CLI и завести `vercel dev`
  - [x] Настроить локальные переменные окружения (например через `.env.local`, без коммита секретов)
- [x] Определить и задокументировать публичные эндпоинты:
  - [x] `POST /api/vk`
  - [x] `POST /api/telegram`
- [x] (опционально) `vercel.json` не требуется (авто-роутинг по `api/*.ts`, лимиты можно добавить позже при необходимости)
- [x] Коротко описать локальный запуск и деплой в `README` (достаточно для повторения)

## Конфигурация (environment variables)

- [x] Завести переменные окружения (локально и в Vercel) — подготовлено через `.env.example`:
  - [x] `VK_TOKEN`
  - [x] `VK_CHAT_ID` (целевой `peer_id`, куда отправлять сообщения в VK)
  - [x] `TG_TOKEN`
  - [x] `TG_CHAT_ID`
  - [x] `VK_SECRET` (secret для Callback API)
  - [x] `VK_CONFIRMATION` (строка подтверждения сервера VK, если используется)
  - [x] (опционально) `TG_WEBHOOK_SECRET` (секрет для `X-Telegram-Bot-Api-Secret-Token`)

---

## Интеграция VK (Callback API → `/api/vk`)

- [x] Создать/выбрать VK Community и включить **Callback API** (см. `docs/VK_SETUP.md`)
- [x] Указать URL обработчика: `https://<domain>/api/vk` (см. `docs/VK_SETUP.md`)
- [x] Задать `secret` в VK и сохранить его значение в `VK_SECRET` (см. `docs/VK_SETUP.md`)
- [x] Реализовать обработку служебных событий VK:
  - [x] На событие `confirmation` отвечать строкой `VK_CONFIRMATION`
  - [x] На любые неизвестные события отвечать `200 OK` без действий
- [x] Реализовать обработку `message_new`:
  - [x] Извлечь текст и нужные метаданные (id, from_id, peer_id и т.д.)
  - [x] Проверить `secret` (если он приходит в payload) против `VK_SECRET`
  - [x] Пропускать сообщения с bridge-маркером (анти-цикл): текст содержит `[BRIDGE:`
  - [x] Сформатировать сообщение для Telegram, добавив маркер `[BRIDGE:VK→TG|...]`
  - [x] Отправить в Telegram через слой retry

## Интеграция Telegram (Webhook → `/api/telegram`)

- [x] Создать бота через BotFather (см. `docs/TELEGRAM_SETUP.md`)
- [x] Отключить privacy mode (чтобы бот видел сообщения в группе) (см. `docs/TELEGRAM_SETUP.md`)
- [x] Добавить бота в целевой чат Telegram и выдать достаточные права (см. `docs/TELEGRAM_SETUP.md`)
- [x] Установить webhook на `https://<domain>/api/telegram` (см. `docs/TELEGRAM_SETUP.md`)
- [x] Защитить входящие вебхуки Telegram:
  - [x] (рекомендуется) передавать `secret_token` при `setWebhook` (см. `docs/TELEGRAM_SETUP.md`)
  - [x] (рекомендуется) валидировать заголовок `X-Telegram-Bot-Api-Secret-Token` == `TG_WEBHOOK_SECRET`
- [x] Реализовать обработку update:
  - [x] Игнорировать апдейты без `message`
  - [x] Игнорировать не-текстовые сообщения (MVP: только текст)
  - [x] Пропускать сообщения с bridge-маркером (анти-цикл): текст содержит `[BRIDGE:`
  - [x] Сформатировать сообщение для VK, добавив маркер `[BRIDGE:TG→VK|...]`
  - [x] Отправить в VK через слой retry

---

## Core bridge logic (нормализация/формат/анти-цикл)

- [x] Реализовать `isBridgeMessage(text)` → проверка наличия `[BRIDGE:`
- [x] Реализовать генерацию короткого идентификатора для маркера:
  - [x] `shortHash(sourceMessageId)` (sha1/sha256 → первые 8 символов)
- [x] Реализовать форматирование исходящих сообщений:
  - [x] `formatForTelegram(vkMsg)` → префикс источника + текст + маркер `VK→TG`
  - [x] `formatForVK(tgMsg)` → префикс источника + текст + маркер `TG→VK`
- [x] (по желанию) Добавить нормализацию текста для fingerprint — не требуется для MVP (bridge-маркер уже предотвращает циклы)
  - [x] trim, схлопывание пробелов, нормализация переносов строк (не делаем в MVP)
  - [x] sha256(normalizedText) (использовать только внутри формата/маркера, без хранения) (не делаем в MVP)

## VK/TG senders (клиенты API)

- [x] Реализовать отправку в VK через `messages.send`:
  - [x] `peer_id = VK_CHAT_ID`
  - [x] `random_id` (например timestamp), чтобы VK подавлял часть дублей отправки
  - [x] `access_token = VK_TOKEN`, версия API (`v`)
- [x] Реализовать отправку в Telegram через `sendMessage`:
  - [x] `chat_id = TG_CHAT_ID`
  - [x] `text = formattedText`

## Retry layer (3 попытки, exponential backoff)

- [x] Реализовать `safeRetry(fn, retries=3)`
- [x] Backoff: 300ms → 600ms → 1200ms
- [x] Ретраить только временные ошибки (сеть/5xx; аккуратно с 4xx)
- [x] Убедиться, что webhook-обработчики возвращают `200` быстро и не “висят” (лимит serverless ≤ 2 мин)

---

## Нефункциональные требования (latency/idempotency/повторы)

- [x] Держать latency обработки в районе ≤ 1 сек (без лишней синхронной работы)
- [x] Идемпотентность на уровне контента:
  - [x] Ключевая гарантия: **встроенный bridge-маркер** предотвращает бесконечные циклы
- [x] Учесть повторную доставку webhook:
  - [x] Спецификация допускает редкие дубли (exactly-once не гарантируется)
  - [x] Минимизировать дубли за счет `random_id` (VK) и bridge-маркера (оба направления)

## Логирование и наблюдаемость

- [x] Добавить структурные логи:
  - [x] источник (vk/tg), тип события, ids, “skipped because bridge marker”
  - [x] результат отправки (ok/error), длительность
- [x] Никогда не логировать токены/секреты (даже при ошибках)

---

## Деплой (Vercel)

- [x] Задеплоить на Vercel (инструкция: `docs/DEPLOY.md`)
- [x] Прописать env vars в настройках проекта Vercel (инструкция: `docs/DEPLOY.md`)
- [x] Пройти валидацию VK Callback URL (confirmation/secret) (инструкция: `docs/DEPLOY.md`)
- [x] Установить webhook Telegram на production URL (инструкция: `docs/DEPLOY.md`)
- [x] Проверить двустороннюю пересылку в реальных чатах (инструкция: `docs/DEPLOY.md`)

## Ручной тест-план (smoke)

- [x] VK → TG: обычный текст из VK появляется в TG с префиксом и маркером (инструкция: `docs/SMOKE_TEST.md`)
- [x] TG → VK: обычный текст из TG появляется в VK с префиксом и маркером (инструкция: `docs/SMOKE_TEST.md`)
- [x] Анти-цикл: сообщения, содержащие `[BRIDGE:`, не пересылаются обратно (инструкция: `docs/SMOKE_TEST.md`)
- [x] Повтор webhook: повторная доставка не вызывает “пинг-понг” (инструкция: `docs/SMOKE_TEST.md`)
- [x] Ошибки API: временно имитировать сбои и убедиться, что retry отрабатывает корректно (инструкция: `docs/SMOKE_TEST.md`)

---

## Ожидаемая структура модулей (как в спецификации)

- [x] `api/vk.ts`
- [x] `api/telegram.ts`
- [x] `lib/vk.ts`
- [x] `lib/telegram.ts`
- [x] `lib/format.ts`
- [x] `lib/security.ts`
- [x] `lib/retry.ts`


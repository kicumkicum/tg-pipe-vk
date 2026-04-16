# Telegram setup (Bot + Webhook)

## 1) Создай бота

- Через BotFather создай бота и получи токен.
- Сохрани в `TG_TOKEN` (Vercel env).

## 2) Добавь бота в группу

- Добавь бота в целевой групповой чат.
- Выключи privacy mode у бота (BotFather → `/setprivacy` → Disable), чтобы он видел сообщения в группе.

## 3) Узнай chat_id

- Для MVP нужен `TG_CHAT_ID` — id группы, куда отправлять сообщения.
- Проще всего: временно включить логирование входящих апдейтов и взять `message.chat.id`.

## 4) Установи webhook

- Webhook URL:
  - `https://<your-domain>/api/telegram`
- Рекомендуется задавать secret token и проверять его в обработчике:
  - `TG_WEBHOOK_SECRET` ↔ заголовок `X-Telegram-Bot-Api-Secret-Token`


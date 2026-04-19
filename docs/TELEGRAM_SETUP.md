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
- Если группу **апгрейдили в супергруппу**, Telegram вернёт ошибку вроде *«group chat was upgraded to a supergroup chat»* — тогда **`chat_id` меняется** (обычно вид `-100…`). Обнови `TG_CHAT_ID` в Vercel по новому `chat.id` из логов и передеплой.

## 3.1) Аватар VK в Telegram (опционально)

- По умолчанию VK→TG шлёт **`sendPhoto`** с маленьким превью из VK (**`photo_100`**, обычно ~100×100px). Ровно **128×128** через Bot API задать нельзя — клиент Telegram сам масштабирует.
- Чтобы **вообще без картинки**, в Vercel: **`TG_SEND_VK_AVATAR=0`** (или `false`) и redeploy.

## 4) Установи webhook

- Webhook URL:
  - `https://<your-domain>/api/telegram`
- Рекомендуется задавать secret token и проверять его в обработчике:
  - `TG_WEBHOOK_SECRET` ↔ заголовок `X-Telegram-Bot-Api-Secret-Token`

### Через npm-скрипт (локально)

Скрипт: `npm run tg:set-webhook` (см. `scripts/tg-set-webhook.mjs`).

Переменные:

- **`TG_TOKEN`**: токен бота (обязательно)
- **`TG_WEBHOOK_URL`**: полный URL вебхука, например `https://<project>.vercel.app/api/telegram` (обязательно, если не передать `--url=...`)
- **`TG_WEBHOOK_SECRET`**: опционально — Telegram отправит его в заголовке `X-Telegram-Bot-Api-Secret-Token`

Примеры:

```bash
TG_WEBHOOK_URL="https://<your-domain>/api/telegram" npm run tg:set-webhook
```

```bash
npm run tg:set-webhook -- --url="https://<your-domain>/api/telegram" --secret-token="your_secret"
```

Проверить текущий webhook:

```bash
npm run tg:webhook-info
```

Примечания:

- По умолчанию скрипт пытается подхватить `./.env.local` (если файл есть). Отключить: `TG_LOAD_DOTENV=0`.
- `allowed_updates` выставляется в **`["message"]`**, потому что этот мост обрабатывает только `message`.


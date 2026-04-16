# Deploy (Vercel)

## 1) Создай проект

- Импортируй репозиторий в Vercel (UI) или используй CLI:
  - `vercel`

## 2) Env vars

В настройках проекта Vercel добавь переменные окружения (см. `.env.example`):

- `VK_TOKEN`
- `VK_CHAT_ID`
- `VK_SECRET`
- `VK_CONFIRMATION`
- `TG_TOKEN`
- `TG_CHAT_ID`
- `TG_WEBHOOK_SECRET` (опционально, но рекомендуется)

## 3) VK Callback API

- Callback URL: `https://<your-domain>/api/vk`
- Укажи `secret` (совпадает с `VK_SECRET`)
- Включи событие `message_new`
- Подтверди сервер (confirmation string → `VK_CONFIRMATION`)

## 4) Telegram webhook

- Webhook URL: `https://<your-domain>/api/telegram`
- Рекомендуется устанавливать webhook с `secret_token` и хранить его в `TG_WEBHOOK_SECRET`

## 5) Проверка

- Отправь тестовое сообщение в VK и убедись, что оно появилось в Telegram
- Отправь тестовое сообщение в Telegram и убедись, что оно появилось в VK


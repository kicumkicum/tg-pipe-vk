# tg-pipe-vk

Stateless webhook bridge между VK и Telegram для деплоя на Vercel.

## Эндпоинты

- `POST /api/vk` — VK Callback API → пересылка в Telegram
- `POST /api/telegram` — Telegram Webhook → пересылка в VK

## Локальный запуск

1) Скопируй `.env.example` в `.env.local` и заполни значения.

2) Запусти:

```bash
npm install
npm run dev
```

Локальная разработка запускается через `vercel dev`.

## Деплой (Vercel)

- Создай проект в Vercel и задеплой репозиторий (через UI или `vercel` CLI).
- Добавь переменные окружения в настройках проекта Vercel (из `.env.example`).
- После деплоя у тебя будут доступны вебхуки:
  - VK Callback URL: `https://<your-domain>/api/vk`
  - Telegram Webhook URL: `https://<your-domain>/api/telegram`


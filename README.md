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


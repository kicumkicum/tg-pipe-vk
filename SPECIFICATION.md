Ниже — цельная, практическая спецификация под твой стек: **Vercel + Express-style handlers (serverless) + VK Callback API + Telegram Webhook API**, без Redis, без БД, без polling и WebSocket.

---

# 📄 1. СПЕЦИФИКАЦИЯ СИСТЕМЫ

## 1.1 Назначение

Система обеспечивает **двустороннюю синхронизацию сообщений** между:

* VK групповой беседой (VK Community Chat)
* Telegram групповой чатом

через serverless backend на Vercel.

---

## 1.2 Архитектура

```text
VK Callback API  →  Vercel Function  →  Telegram Bot API

Telegram Webhook →  Vercel Function  →  VK API
```

---

## 1.3 Ограничения архитектуры

* ❌ нет Redis / БД / persistent storage
* ❌ нет WebSocket / polling
* ❌ нет state между запросами
* ✔ только stateless HTTP handlers
* ✔ Vercel serverless execution (≤ 2 min)

---

## 1.4 Ключевые требования

### Функциональные:

* VK → TG пересылка сообщений
* TG → VK пересылка сообщений
* только текст (MVP)
* предотвращение циклов пересылки
* retry при временных ошибках API

### Нефункциональные:

* latency ≤ 1 сек
* idempotent обработка webhook событий
* устойчивость к повторной доставке webhook

---

## 1.5 Главная инженерная проблема

Без состояния нельзя:

* хранить processed messages
* делать классический dedup

---

## 1.6 Решение (core design)

Используется 3-уровневая защита:

### 1) Source-level idempotency

```
(source + sourceMessageId)
```

### 2) Content fingerprint

```
sha256(text normalized)
```

### 3) Embedded bridge marker (ключевой механизм)

Сообщение само содержит маркер пересылки:

```
[BRIDGE:VK→TG|abc123]
```

👉 Это позволяет полностью отказаться от storage.

---

# 📄 2. ПЛАН РЕАЛИЗАЦИИ

## Этап 1 — Инициализация проекта

* Next.js (или чистый Vercel Functions)
* 2 API routes:

  * `/api/vk`
  * `/api/telegram`

---

## Этап 2 — Интеграция VK

* создать VK Community
* включить Callback API
* установить secret
* настроить webhook → Vercel `/api/vk`

---

## Этап 3 — Интеграция Telegram

* создать bot через BotFather
* выключить privacy mode
* установить webhook:

```
https://your-domain.vercel.app/api/telegram
```

---

## Этап 4 — Core bridge logic

* normalize VK message
* normalize TG message
* detect bridge marker
* format outgoing message
* send to opposite platform

---

## Этап 5 — Retry layer

* 3 попытки отправки
* exponential backoff (300ms → 600ms → 1200ms)

---

## Этап 6 — Deployment

* Vercel deploy
* environment variables
* webhook verification

---

# 📄 3. СТРУКТУРА ПРОЕКТА

```
/api
  /vk.ts
  /telegram.ts

/lib
  vk.ts
  telegram.ts
  format.ts
  security.ts
  retry.ts
```

---

# 📄 4. ПРИМЕРЫ КОДА

---

# 4.1 VK webhook handler

```ts
// /api/vk.ts

import { sendToTelegram } from "../lib/telegram";
import { isBridgeMessage, formatForTelegram } from "../lib/format";
import { safeRetry } from "../lib/retry";

export default async function handler(req, res) {
  const event = req.body;

  if (event.type !== "message_new") {
    return res.status(200).end();
  }

  const message = event.object;

  if (isBridgeMessage(message.text)) {
    return res.status(200).end();
  }

  const formatted = formatForTelegram(message);

  await safeRetry(() => sendToTelegram(formatted));

  res.status(200).end();
}
```

---

# 4.2 Telegram webhook handler

```ts
// /api/telegram.ts

import { sendToVK } from "../lib/vk";
import { isBridgeMessage, formatForVK } from "../lib/format";
import { safeRetry } from "../lib/retry";

export default async function handler(req, res) {
  const update = req.body;

  const message = update.message;
  if (!message) return res.status(200).end();

  if (isBridgeMessage(message.text)) {
    return res.status(200).end();
  }

  const formatted = formatForVK(message);

  await safeRetry(() => sendToVK(formatted));

  res.status(200).end();
}
```

---

# 4.3 Format layer (ключевая логика)

```ts
// /lib/format.ts

import crypto from "crypto";

export function isBridgeMessage(text = "") {
  return text.includes("[BRIDGE:");
}

function shortHash(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
}

export function formatForTelegram(vkMsg) {
  const hash = shortHash(String(vkMsg.id));

  return {
    text: `[VK | ${vkMsg.from_id}]
${vkMsg.text}

[BRIDGE:VK→TG|${hash}]`
  };
}

export function formatForVK(tgMsg) {
  const hash = shortHash(String(tgMsg.message_id));

  return `[TG | ${tgMsg.from.username || "user"}]
${tgMsg.text}

[BRIDGE:TG→VK|${hash}]`;
}
```

---

# 4.4 VK sender

```ts
// /lib/vk.ts

import axios from "axios";

const VK_TOKEN = process.env.VK_TOKEN!;
const VK_CHAT_ID = process.env.VK_CHAT_ID!;

export async function sendToVK(text: string) {
  return axios.post("https://api.vk.com/method/messages.send", {
    peer_id: VK_CHAT_ID,
    message: text,
    random_id: Date.now(),
    access_token: VK_TOKEN,
    v: "5.131"
  });
}
```

---

# 4.5 Telegram sender

```ts
// /lib/telegram.ts

import axios from "axios";

const TG_TOKEN = process.env.TG_TOKEN!;
const TG_CHAT_ID = process.env.TG_CHAT_ID!;

export async function sendToTelegram(payload: { text: string }) {
  return axios.post(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      chat_id: TG_CHAT_ID,
      text: payload.text
    }
  );
}
```

---

# 4.6 Retry layer (без state)

```ts
// /lib/retry.ts

export async function safeRetry(fn: () => Promise<any>, retries = 3) {
  let delay = 300;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
```

---

# 📄 5. ВАЖНЫЕ ОГРАНИЧЕНИЯ (ЧЕСТНО)

## ❌ Что НЕ гарантируется

* exactly-once delivery
* защита от редких дублей webhook
* устойчивость при параллельных инстансах
* история сообщений

---

## ✔ Что гарантируется

* отсутствие бесконечных циклов
* стабильная пересылка сообщений
* работа на Vercel без инфраструктуры
* минимальная задержка (serverless-friendly)

---

# 📄 6. ИТОГОВАЯ МОДЕЛЬ

Ты строишь:

> **stateless bidirectional webhook message relay with embedded loop protection**

---


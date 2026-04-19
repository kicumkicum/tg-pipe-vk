const fetch = require(`node-fetch`);

// Example
// HOST="https://9259-176-116-136-144.ngrok-free.app" ENDPOINT="api/telegram/" TOKEN="197891234:AAoHsnot34oVgkZy5eATzUaktQfAYfIlpTQDEGA" node tools/change-telegram-bot-host.js

const TOKEN = process.env.TOKEN;
const HOST = process.env.HOST;
const ENDPOINT = (process.env.ENDPOINT || `api/telegram`).replace(`/$`, ``);

const createUrl = (token) => {
  return `https://api.telegram.org/bot${token}/setWebhook`;
};

const createPayload = (host) => {
  return {"url": `${host}/${ENDPOINT}`};
};

const headers = {
  "Content-type": `application/json`,
};

(async () => {
  if (!TOKEN || !HOST) {
    throw new Error(`Token or host not exist. HOST: ${HOST}, TOKEN: ${TOKEN}`);
  }

  const response = await (await fetch(createUrl(TOKEN), {
    body: JSON.stringify(createPayload(HOST)),
    method: `POST`,
    headers,
  })).text();

  // eslint-disable-next-line no-console
  console.log(response);
})();

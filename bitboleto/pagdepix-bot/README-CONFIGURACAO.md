# Configuração do Bot PagDepix

## Conflito: um token, dois usos

O **mesmo** bot do Telegram (@PagDepixBot) é usado em dois lugares:

| Onde | Função | Como recebe mensagens |
|------|--------|------------------------|
| **Backend (API)** | Verificação de conta: ao dar `/start`, gera e envia o código de 6 dígitos para o usuário vincular a conta no site | **Webhook** → `POST https://seu-dominio.com/api/webhook/telegram` |
| **pagdepix-bot (esta pasta)** | Suporte: tickets, encaminhar mensagens para grupo de atendentes | **Polling** (`bot.launch()`) |

No Telegram **só pode haver uma das duas** para o mesmo token: ou webhook ou polling. Se o **pagdepix-bot** estiver rodando com polling, ele “leva” as atualizações e a API **não** recebe o `/start` → a verificação de conta no site **não funciona**.

---

## O que você precisa configurar

### Opção A: Verificação no site é prioritária (recomendado)

Para o fluxo de **verificação de conta** (usuário dá `/start` no bot e recebe o código no Telegram) funcionar:

1. **Não rode** o `pagdepix-bot` com o **mesmo** `BOT_TOKEN` que a API usa.
2. **Configure o webhook** do bot para apontar para a sua API:
   - No **backend** do projeto, rode o script:
     ```bash
     cd backend
     node scripts/set-telegram-webhook.js
     ```
   - Ou manualmente: no BotFather não dá para colocar URL; use a API do Telegram:
     ```bash
     curl "https://api.telegram.org/bot<SEU_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://www.pagdepix.com/api/webhook/telegram"
     ```
     (troque o token e a URL pela sua.)
3. Se usar `TELEGRAM_WEBHOOK_SECRET` no backend, configure o mesmo valor no webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://www.pagdepix.com/api/webhook/telegram" \
     --data-urlencode "secret_token=SEU_TELEGRAM_WEBHOOK_SECRET"
   ```
   (Ou use o script `set-telegram-webhook.js`, que lê do `.env`.)

Com isso, **só a API** recebe as mensagens. O `/start` gera e envia o código. Outras mensagens recebem a resposta padrão da API (ex.: “Para vincular, envie /start”). O **suporte por tickets** (esta pasta) **não** será usado com esse bot, a menos que você integre a lógica de tickets no backend.

---

### Opção B: Dois bots (verificação + suporte)

- **Bot 1** (ex.: @PagDepixBot): token usado no **backend**; webhook apontando para `https://seu-dominio.com/api/webhook/telegram`. Usado no site para **verificação** e link “Abrir Telegram”.
- **Bot 2** (ex.: @PagDepixSuporteBot): outro token; **pagdepix-bot** roda com **polling** usando esse segundo token. Usado só para **suporte** (tickets, grupo).

Aí você configura no `.env` do **backend**: `TELEGRAM_BOT_TOKEN` = token do Bot 1. No **pagdepix-bot**: `BOT_TOKEN` = token do Bot 2. Sem conflito.

---

## Resumo

- **Sim, é preciso configurar:** o webhook do bot (token da API) deve apontar para a URL da API (`/api/webhook/telegram`).
- **pagdepix-bot** (suporte) não pode usar **polling** com o **mesmo** token que a API usa; senão a verificação de conta deixa de funcionar.
- Use o script `backend/scripts/set-telegram-webhook.js` (ou o `curl` acima) depois de colocar no `.env` do backend: `TELEGRAM_BOT_TOKEN`, e opcionalmente `TELEGRAM_WEBHOOK_SECRET` e a URL base da API.

# Pendências de segurança — Bloco 2 e adjacentes

## webhook GeraDePix sem assinatura
- Endpoint: POST /webhook/geradepix
- Arquivo: src/controllers/geradepixWebhookController.ts
- Status: aceita qualquer POST não-autenticado
- Documentação atual da GeraDePix não oferece mecanismo de assinatura
- Ação: solicitar ao suporte da GeraDePix mecanismo de assinatura HMAC
        ou alternativa (ex: chamada de callback validável via API)
- Mitigação temporária: até lá, dependemos só de obscuridade da URL +
  validação de payload + idempotência

## webhook Telegram com secret opcional
- Arquivo: src/controllers/telegramController.ts
- Comportamento atual: if (!secret) return true → endpoint aberto
  quando TELEGRAM_WEBHOOK_SECRET não configurado
- Esperado: secret deve ser obrigatório, faltar = erro 500 ou rejeição
- Bloco 1 (env validation) já força a presença de TELEGRAM_BOT_TOKEN, mas o
  handler ainda tem o "fail-open" em validateTelegramWebhook — corrigir num
  bloco futuro de hardening

## Limite de cupom por IP/device inoperante em PCC

- Arquivo: pixCopiaCola.ts (adminProcessPixCopiaCola)
- Comportamento atual: CouponUsage criada para PCC com userIp='' (vazio)
- Consequência: limite por IP em validateCouponUsage não funciona para PCC,
  mesmo após Bug A ter sido corrigido (limite por email/telegram funciona)
- Solução: passar req.ip do controller até createPixCopiaCola e
  adminProcessPixCopiaCola, armazenar em PixCopiaCola.userIp como novo campo
  (mudança de schema)
- Ação: Bloco 6 (médios) ou bloco dedicado a antifraud

## webhook GeraDePix sem rate limit
- Endpoint: POST /webhook/geradepix
- Risco: DoS por flood de webhooks falsos sem custo para o atacante
- Ação: aplicar rate limit específico para rotas /webhook/* num bloco futuro
  de hardening (separado do rate limit geral de usuários)

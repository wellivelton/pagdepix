# Briefing — projeto PagdePix, correção da auditoria de segurança

Você está sendo trazido pra meio de um trabalho em andamento. Leia este
briefing inteiro antes de fazer qualquer coisa.

## O projeto

PagdePix — sistema financeiro com PIX, boletos, recargas de celular e
integração com Liquid Network (sidechain Bitcoin).

Stack:
- Backend: Node.js + TypeScript 5.9 + Express 5 (RC) + Prisma 6 + PostgreSQL
- Banco secundário: SQLite (better-sqlite3) para bot Telegram
- Crypto: bitcoinjs-lib, liquidjs-lib, bip32 (Liquid Network)
- Gateways: GeraDePix, Velora, Asaas
- Email: Resend + SendGrid
- Frontend: React 19 + Vite 7 + Tailwind 3 (não é foco)
- Testes: Vitest (76 testes, todos passando)

## Localização

cd "/home/wellivelton/Área de trabalho/Projetos VS Code/pagdepix"
Backend em: bitboleto/backend/

## O que JÁ FOI FEITO (não retrabalhar)

8 commits locais na branch main, à frente do origin (não fizeram push):

1. 6bdb628 — security: env vars validadas no startup
   - src/config/env.ts (porteiro de env vars)
   - Removeu fallbacks hardcoded de JWT_SECRET, LIQUID_*, GERADEPIX_API_KEY, DATABASE_URL
   - Crash no startup se var crítica ausente

2. 9058b23 — feat: Asaas/Liquid HD wallet/Velora integrations
   - Mudanças do usuário antes da auditoria
   - Schema: Float→Decimal em PixCopiaCola, novos enums
   - Nova taxa PIX Copia e Cola = R$ 2,50 fixo + 3% sobre (valor + 2,50)

3. bc7c437 — feat: frontend visual update (não tocar)

4. 4a9d359 — chore: track prisma migrations in git
   - Conserta .gitignore que ignorava *.sql incluindo migrations
   - 59 migrations adicionadas ao git num backfill

5. 6fe0044 — feat: webhook idempotency for telegram, geradepix, velora
   - WebhookIdempotencyKey com chave (source, eventType, externalId)
   - Helper: src/services/webhookIdempotency.service.ts
   - Aplicado em telegram, geradepix, velora handlers
   - Trata: result='ok' bloqueia, result='error' libera retry,
     result='pending' >10min libera retry (crash recovery)

6. 90e8c82 — feat(pix-copia-cola): atomic approval + race-safe creation
   - adminProcessPixCopiaCola: 6 escritas atômicas em prisma.$transaction
     com isolationLevel: 'Serializable', timeout 10s
   - createPixCopiaCola: SELECT FOR UPDATE no cupom (tx.$queryRaw),
     retry P2002 em liquidAddressIndex (max 3)
   - Bug A: CouponUsage.create com pixCopiaColaId (limite por usuário)
   - Bug B: coupon.update fora de if(affiliateId)
   - Bug C: removido try/catch que engolia erros
   - Migration: 20260502130000_add_pcc_to_coupon_usage

7. 1e8ae71 — feat(mobile-recharge): atomic finalization + race-safe creation
   - Mesmo padrão do PCC aplicado a finalizeApprovedRecharge
   - Atomic claim PENDING/PROCESSING → PAID via updateMany
   - adminMarkRechargePaid e adminApproveRechargeWithReceipt: claim
     PENDING → PROCESSING antes de Asaas, revert em caso de falha
   - Mesmos bugs A/B/C corrigidos
   - Removeu asaasStatus: 'CONFIRMED' hardcoded
   - Migration: 20260502140000_add_mobile_recharge_to_coupon_usage

8. b0d7ecf — feat(boleto): atomic approval extracted to service +
   race-safe creation
   - Extraiu approveBoleto pra src/services/approveBoleto.ts
   - adminController.approveBoleto e payBoletoViaAsaas viraram wrappers
   - payBoletoViaAsaas agora roda comissão/cupom/referral (antes pulava)
   - Boleto.liquidAddressIndex agora @unique (estava sem na migration original)
   - Novos campos: paidViaAsaas, asaasPaymentId, adminNotes
   - Mesmos bugs A/B/C corrigidos
   - Migration: 20260502150000_add_boleto_unique_index_and_asaas_fields

## EM ANDAMENTO — Bloco 3.4 (createBoletoBatch.ts)

Próxima task. Ainda não começou. É o último sub-bloco do Bloco 3
(transações atômicas). Mesmo padrão dos blocos anteriores, adaptado
pro fato de que batch = N boletos numa operação.

Estratégia:
1. Mapeamento ANTES de implementar (igual fizemos nos outros 3 sub-blocos)
2. Revisão do mapa pelo orientador (humano + Claude web)
3. Plano de implementação aprovado
4. Implementação
5. Revisão de código real (não resumo)
6. Commit

## O que VEM DEPOIS do 3.4

- Bloco 4 — auth/CSRF/headers (Altos 6, 7, 12, 13)
- Bloco 5 — rate limit/timeouts/brute force (Altos 8, 9, 11)
- Bloco 6 — race em saque de afiliado (Alto 10)
- Bloco 7 — médios consolidados

## Convenções estabelecidas no projeto

- Helpers em src/services/
- Testes em src/services/__tests__/<nome>.test.ts
- Migrations: timestamp YYYYMMDDHHMMSS no nome, SQL manual em
  migration.sql. NÃO usa prisma migrate dev — gera timestamp manual,
  sempre maior que a última (atual: 20260502150000)
- Não atualizar libs (Express 5 RC, React 19, Prisma 6 são intencionais)
- Não tocar em código de assinatura/derivação Liquid sem confirmação
- Commits separados por bloco da auditoria
- SECURITY_TODOS.md na raiz do backend acumula pendências

## Limitações do ambiente

- Banco local com erro P3005. NÃO rodar prisma migrate deploy/dev
  até o usuário pedir. Testes Vitest usam mock/banco em memória.
- Sem ambiente de staging. Usuário testa local quando estiver pronto.
- Não fazer push pro origin. Tudo fica local.

## Como vamos trabalhar

1. Orientador via chat web entrega prompts focados, um sub-bloco por vez
2. Você executa, mostra diff/output literal (não resumo)
3. Orientador revisa e aprova
4. Você commita só com aprovação explícita

NUNCA commite sem aprovação explícita.

## Pendências documentadas no SECURITY_TODOS.md

- userIp não capturado em PCC, mobile recharge, boleto (CouponUsage
  com userIp='')
- GeraDePix sem assinatura de webhook
- Telegram fail-open quando secret ausente
- Rate limit em /webhook/geradepix
- Cupom não-reservado na criação (decremento na expiração/cancelamento)
- ReferralEarning é log-only — sem campo User.balance, indicadores
  nunca recebem de fato

## Status atual: aguardando

Aguarda orientador entregar o prompt de mapeamento do Bloco 3.4
(createBoletoBatch.ts) na próxima sessão.

# Continuação da auditoria PagdePix

Estamos no meio de uma correção sistemática de auditoria de segurança 
do PagdePix (sistema financeiro: PIX, boleto, recarga de celular, Liquid 
Network).

## Stack
Node + TypeScript 5.9 + Express 5 RC + Prisma 6 + PostgreSQL + React 19. 
Testes em Vitest.

## Como estamos trabalhando
- Você (Claude web) é o orientador. Eu rodo um Claude Code no terminal.
- Você me entrega prompts pro Claude Code, um sub-bloco por vez.
- Eu executo, colo o resultado, você revisa, aprova ou pede ajuste.
- Só commitamos com sua aprovação explícita.
- Tudo fica local, sem push pro GitHub, sem deploy.
- Vou testar manualmente depois de tudo corrigido.

## Mapa da auditoria — 25 itens (5 críticos, 8 altos, 12 médios)

### Já resolvidos (8 commits locais):
1. 6bdb628 — Bloco 1: env vars validadas (Críticos 1 e 4)
2. 9058b23 — features que eu já tinha pronto antes da auditoria
3. bc7c437 — frontend (não tocar)
4. 4a9d359 — fix do .gitignore que escondia migrations
5. 6fe0044 — Bloco 2: webhook idempotency (Crítico 5)
6. 90e8c82 — Bloco 3.1: pixCopiaCola atomicidade + race cupom 
   (Críticos 2 e 3)
7. 1e8ae71 — Bloco 3.2: mobileRecharge atomicidade
8. b0d7ecf — Bloco 3.3: boleto atomicidade + extraído pra service

### Próximo:
- Bloco 3.4 — createBoletoBatch.ts (último sub-bloco do 3, transações 
  atômicas em batch de boletos)

### Roadmap restante:
- Bloco 4 — auth/CSRF/headers (Altos 6, 7, 12, 13)
- Bloco 5 — rate limit/timeouts/brute force (Altos 8, 9, 11)
- Bloco 6 — race em saque de afiliado (Alto 10)
- Bloco 7 — médios consolidados

## Bugs extras descobertos no caminho (não estavam na auditoria)
- Bug A: CouponUsage não criada em PCC/mobile/boleto → limite per-user 
  não funcionava (corrigido em 3.1, 3.2, 3.3)
- Bug B: coupon.usageCount aninhado em if(affiliateId) → cupons sem 
  afiliado nunca incrementavam (corrigido em 3.1, 3.2, 3.3)
- Bug C: try/catch silenciando erros do bloco afiliado/cupom/referral 
  (corrigido em 3.1, 3.2, 3.3)
- payBoletoViaAsaas pulava toda lógica pós-aprovação (unificado em 3.3)
- Boleto.liquidAddressIndex sem @unique (corrigido em 3.3)
- Migrations fora do git (corrigido em 4a9d359)

## Pendências documentadas em SECURITY_TODOS.md
- userIp não capturado em CouponUsage (PCC, mobile, boleto)
- GeraDePix webhook sem assinatura
- Telegram fail-open quando secret ausente
- Rate limit em /webhook/geradepix (Bloco 5 vai resolver)
- Cupom não-reservado na criação
- ReferralEarning é log-only — User não tem campo balance

## Convenções estabelecidas
- Helpers em src/services/
- Testes em src/services/__tests__/<nome>.test.ts
- Migrations: timestamp YYYYMMDDHHMMSS, SQL manual (atual: 20260502150000)
- Sem atualizar libs (Express 5 RC, React 19, Prisma 6 são intencionais)
- Sem tocar em código Liquid de assinatura/derivação sem confirmação

## Limitações conhecidas
- Banco local com erro P3005 — não rodar prisma migrate até hora de testar
- Sem staging — só máquina local
- Sem testes escritos antes (só infra do Vitest); todos os 76 testes 
  atuais foram criados durante a correção da auditoria

## Padrão de implementação dos blocos críticos (3.1, 3.2, 3.3)
Cada bloco seguiu mesma estrutura:
1. prisma.$transaction com isolationLevel: 'Serializable', timeout 10s
2. Atomic claim no início (updateMany condicional)
3. Bloco de afiliado/referral/cupom DENTRO da transação, sem try/catch
4. CouponUsage.create dentro da mesma transação
5. Notificações (push, telegram, webhook) FORA da transação
6. SELECT FOR UPDATE no cupom durante CREATE (lock pessimista)
7. Retry loop max 3 para colisão de liquidAddressIndex (P2002)

## Próximo passo

Quando eu voltar, vou colar este briefing e te pedir pra montar o 
prompt de MAPEAMENTO do Bloco 3.4 (createBoletoBatch.ts). Você vai 
seguir o mesmo padrão dos blocos anteriores: pedir o mapa primeiro, 
revisar comigo, depois implementação.

Pontos de atenção esperados pro 3.4:
- Batch = N boletos numa operação. Diferença vs boleto individual?
- Tem aprovação em lote? Como funciona?
- liquidAddressIndex no schema do BoletoBatch (já tem @unique segundo 
  vimos no Bloco 3.3)
- Possíveis bugs A/B/C presentes aqui também
- Atomicidade: cada boleto vira sua própria transação ou é uma 
  transação única do batch inteiro?

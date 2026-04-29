# Documentação Técnica – PagDepix

**Última atualização:** Janeiro de 2026

Esta documentação descreve a arquitetura, instalação, configuração e uso técnico do sistema PagDepix (pagamento de boletos com DEPIX na Liquid Network).

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Requisitos](#2-requisitos)
3. [Instalação](#3-instalação)
4. [Variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Banco de dados](#5-banco-de-dados)
6. [Backend – Estrutura e rotas da API](#6-backend--estrutura-e-rotas-da-api)
7. [Frontend – Estrutura e rotas](#7-frontend--estrutura-e-rotas)
8. [Webhook Telegram](#8-webhook-telegram)
9. [Deploy em produção](#9-deploy-em-produção)
10. [Segurança e boas práticas](#10-segurança-e-boas-práticas)

---

## 1. Visão geral

- **Backend:** Node.js + Express (TypeScript), Prisma ORM, PostgreSQL.
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, React Router.
- **Autenticação:** JWT (Bearer token).
- **Integrações:** SendGrid (e-mail), Telegram Bot (verificação e suporte), opcional: API de VPN/geolocalização.
- **Rede:** Liquid Network (DEPIX).

Fluxo principal: usuário cadastra-se → verifica e-mail e Telegram → cria boleto → envia DEPIX para o endereço indicado → informa TXID → admin aprova/rejeita → comprovante disponível.

---

## 2. Requisitos

- **Node.js** 18+ (recomendado 20+)
- **PostgreSQL** 14+
- **npm** ou **yarn**
- Conta **SendGrid** (e-mail)
- Bot no **Telegram** (token via @BotFather) para verificação e suporte
- (Opcional) API de detecção de VPN/geolocalização

---

## 3. Instalação

### 3.1. Clonar / copiar o projeto

```bash
# Exemplo: pasta do projeto
cd /caminho/do/projeto
```

### 3.2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env com valores reais (ver seção 4)
npx prisma generate
npx prisma migrate deploy
# (Opcional) npx prisma db seed
npm run dev   # desenvolvimento (porta 3001)
# ou
npm run build && npm start  # produção
```

### 3.3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # se existir
# Definir VITE_API_URL no .env (ex.: http://localhost:3001 para dev)
npm run dev   # desenvolvimento (porta 5173)
# ou
npm run build && npm run preview  # build para produção
```

### 3.4. Criar usuário admin (primeiro acesso)

Após as migrações, criar um usuário com role ADMIN diretamente no banco (ex.: via Prisma Studio ou SQL):

```bash
cd backend
npx prisma studio
```

Na tabela `User`, criar registro com `role = ADMIN` e, se desejar, `emailVerified = true` e `telegramVerified = true` para não precisar verificar. Ou usar um seed que crie o admin (ajustar `prisma/seed.ts` conforme necessidade).

---

## 4. Variáveis de ambiente

### 4.1. Backend (`.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta do servidor (padrão 3001) |
| `APP_URL` | Sim (prod) | URL base do backend (ex.: https://api.pagdepix.com) |
| `FRONTEND_URL` | Sim | URL do frontend (links em e-mails; ex.: https://pagdepix.com) |
| `DATABASE_URL` | Sim | Connection string PostgreSQL (ex.: postgresql://user:pass@localhost:5432/pagdepix?schema=public) |
| `JWT_SECRET` | Sim | Chave secreta para assinatura do JWT (gerar valor forte e único) |
| `TELEGRAM_BOT_TOKEN` | Sim | Token do bot Telegram (obtido em @BotFather) |
| `SENDGRID_API_KEY` | Sim | Chave API SendGrid para envio de e-mails |
| `VPN_API_URL` | Não | URL da API de detecção de VPN (opcional) |
| `VPN_API_KEY` | Não | Chave da API de VPN (opcional) |
| `NODE_ENV` | Não | `development` ou `production` |
| `AWS_*` | Não | Para storage S3 em produção (uploads); ver .env.example |

### 4.2. Frontend (`.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_API_URL` | Sim (prod) | URL base da API (ex.: https://api.pagdepix.com). Em dev pode ser http://localhost:3001 |

---

## 5. Banco de dados

### 5.1. Schema principal (Prisma)

- **User:** id, name, email, telegram, passwordHash, role (USER | ADMIN | AFFILIATE), isActive, isBlocked, emailVerified, emailVerifyToken, emailVerifyExpires, passwordResetToken, passwordResetExpires, telegramVerified, telegramVerifyToken, telegramVerifyExpires, deviceFingerprint, dailyLimit, totalPaid, lastLoginAt, lastLoginIp, lastLoginCity, lastLoginCountry, lastLoginIsVpn, createdAt, updatedAt.
- **Boleto:** id, barcode, pdfUrl, pdfPassword, amount, fee, totalAmount, dueDate, depixAmount, walletAddress, qrCode, txid (unique), status (PENDING | PAID | PROBLEM | CANCELLED), receiptUrl, couponUsed, couponId, affiliateId, problemReason, userId, createdAt, paidAt, confirmedAt.
- **Affiliate:** id, userId, couponCode, balance, pendingBalance, totalEarned, liquidWallet, lastWalletChange, isActive, createdAt.
- **AffiliateTransaction:** id, affiliateId, boletoId, amount, commission, status (PENDING | AVAILABLE | PAID), createdAt, availableAt.
- **Coupon:** id, code, discount, commission, affiliateId, isActive, usageCount, maxUsage, createdAt.
- **CouponUsage:** id, couponId, userId, userEmail, userTelegram, userIp, deviceFingerprint, boletoId, createdAt.
- **Withdrawal:** id, affiliateId, userId, amount, liquidWallet, status (PENDING | APPROVED | REJECTED | PAID), adminNotes, createdAt, processedAt.
- **Log:** id, action, details, ip, userAgent, userId, createdAt.
- **BlockedIp:** id, ip, reason, createdAt, expiresAt.
- **Config:** id (singleton "config"), walletAddress, qrCodeUrl, updatedAt, updatedBy.
- **LoginAttempt:** id, email, ip, success, createdAt.
- **AccountCreation:** id, userId, ip, deviceFingerprint, createdAt.

### 5.2. Migrações

```bash
cd backend
npx prisma migrate deploy   # aplicar migrações
npx prisma generate        # gerar cliente Prisma
```

---

## 6. Backend – Estrutura e rotas da API

### 6.1. Estrutura de pastas

```
backend/src/
├── server.ts           # Entrada do servidor Express
├── prisma.ts           # Instância do Prisma Client
├── controllers/        # Handlers das rotas
│   ├── adminController.ts
│   ├── affiliateController.ts
│   ├── authController.ts
│   ├── telegramController.ts
│   ├── userController.ts
│   └── withdrawalController.ts
├── middlewares/
│   ├── authMiddleware.ts (lógica em routes/index)
│   ├── bruteForceProtection.ts
│   └── rateLimiter.ts
├── routes/
│   └── index.ts        # Todas as rotas montadas em /api
├── services/
│   ├── createBoleto.ts
│   ├── email.service.ts
│   ├── telegram.service.ts
│   └── updateBoletoTxid.ts
└── utils/
    ├── antifraud.ts
    ├── auth.ts
    ├── deviceFingerprint.ts
    ├── ipInfo.ts
    └── taxConfig.ts
```

### 6.2. Base URL da API

Todas as rotas abaixo têm prefixo **`/api`**. Exemplo: `POST /api/auth/login`.

### 6.3. Rotas públicas (sem autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Cadastro (nome, email, telegram, password) |
| POST | `/auth/login` | Login (email, password) → retorna JWT |
| POST | `/auth/forgot-password` | Solicitar reset de senha (email) |
| GET | `/auth/verify-email?token=...` | Confirmar e-mail (token no link) |
| GET | `/auth/validate-reset-token?token=...` | Validar token de reset |
| POST | `/auth/reset-password` | Redefinir senha (token + nova senha) |
| POST | `/webhook/telegram` | Webhook do Telegram (recebe updates do bot) |
| POST | `/boleto/simulate` | Simular taxa (body: { amount }) – usado no simulador da landing |

### 6.4. Rotas protegidas (Header: `Authorization: Bearer <JWT>`)

**Usuário / Perfil**

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/user/profile` | Perfil do usuário logado |
| PUT | `/user/profile` | Atualizar nome e Telegram |
| PUT | `/user/change-password` | Alterar senha |
| POST | `/auth/request-telegram-verification` | Gerar código de 6 caracteres para verificação no Telegram |

**Upload**

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/upload/boleto` | Upload de arquivo (PDF/comprovante); multipart; retorna URL do arquivo |

**Boletos**

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/boleto/calculate` | Calcular taxa (body: amount, couponCode opcional) |
| POST | `/boleto/create` | Criar boleto (barcode, pdfUrl, amount, dueDate, couponCode, pdfPassword opcional) |
| GET | `/boleto/list` | Listar boletos do usuário (query: status, page, limit) |
| GET | `/boleto/:id` | Detalhes de um boleto |
| POST | `/boleto/:id/txid` | Registrar TXID (body: { txid }) |
| GET | `/boleto/:id/status` | Status do boleto |
| POST | `/boleto/:id/cancel` | Cancelar boleto |
| PUT | `/boleto/:id` | Atualizar boleto pendente (barcode, dueDate, txid) |

**Admin** (requer role ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/boletos` | Listar todos os boletos |
| POST | `/admin/boleto/:id/approve` | Aprovar boleto (upload comprovante opcional) |
| POST | `/admin/boleto/:id/reject` | Rejeitar boleto |
| GET | `/admin/users` | Listar usuários |
| POST | `/admin/users/:id/action` | Ação em usuário (bloquear, desativar, limite) |
| POST | `/admin/users/:id/affiliate` | Tornar usuário afiliado |
| POST | `/admin/users/:id/verify` | Marcar email/telegram como verificado |
| GET | `/admin/logs` | Logs de auditoria |
| GET | `/admin/wallet-config` | Configuração da carteira (endereço, QR) |
| PUT | `/admin/wallet-config` | Atualizar configuração da carteira |
| GET | `/admin/withdrawals` | Listar saques |
| POST | `/admin/withdrawal/:id/process` | Processar saque (aprovar/rejeitar/pagar) |

**Afiliado**

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/affiliate/data` | Dados do afiliado (cupom, saldos, ganhos, histórico) |
| POST | `/withdrawal/request` | Solicitar saque (amount, liquidWallet) |
| GET | `/withdrawal/list` | Listar saques do afiliado |

### 6.5. Arquivos estáticos

- **Uploads:** servidos em `/uploads` (ex.: `/uploads/boletos/<filename>`). A URL completa depende de `APP_URL` ou proxy no Nginx.

---

## 7. Frontend – Estrutura e rotas

### 7.1. Estrutura de pastas

```
frontend/src/
├── main.tsx
├── App.tsx              # Rotas e ProtectedRoute / AdminRoute / AffiliateRoute
├── App.css
├── index.css
├── services/
│   └── api.ts           # Axios com baseURL (VITE_API_URL) e Bearer token
├── pages/
│   ├── Landing.tsx      # /
│   ├── Login.tsx        # /login
│   ├── VerifyEmail.tsx  # /verify-email
│   ├── ForgotPassword.tsx  # /forgot-password
│   ├── ResetPassword.tsx  # /reset-password
│   ├── Dashboard.tsx    # Layout com sidebar (dashboard, pagar, histórico, etc.)
│   ├── PayBoleto.tsx    # /pagar
│   ├── History.tsx      # /historico
│   ├── Settings.tsx     # /config
│   ├── Support.tsx      # /suporte
│   ├── VerifyTelegram.tsx # /verificar-telegram
│   ├── Admin.tsx        # /admin
│   ├── AdminWallet.tsx  # /admin/carteira
│   ├── AffiliateEarnings.tsx # /afiliado/ganhos
│   └── Wallet.tsx       # (página existente; rota não exposta no App por padrão)
└── assets/
```

### 7.2. Rotas do frontend

| Caminho | Página | Acesso |
|---------|--------|--------|
| `/` | Landing | Público |
| `/login` | Login | Público |
| `/verify-email` | VerifyEmail | Público |
| `/forgot-password` | ForgotPassword | Público |
| `/reset-password` | ResetPassword | Público |
| `/dashboard` | Dashboard | Logado |
| `/pagar` | PayBoleto | Logado |
| `/historico` | History | Logado |
| `/config` | Settings | Logado |
| `/suporte` | Support | Logado |
| `/verificar-telegram` | VerifyTelegram | Logado |
| `/admin` | Admin | Admin |
| `/admin/carteira` | AdminWallet | Admin |
| `/afiliado/ganhos` | AffiliateEarnings | Afiliado |

### 7.3. Autenticação no frontend

- Token JWT armazenado em `localStorage` (chave `token`).
- Dados do usuário em `localStorage` (chave `user`).
- O serviço `api.ts` adiciona `Authorization: Bearer <token>` em todas as requisições.
- `ProtectedRoute` redireciona para `/login` se não houver token.
- `AdminRoute` e `AffiliateRoute` redirecionam conforme a role em `user`.

---

## 8. Webhook Telegram

### 8.1. Configuração

O bot (@PagDepixBot) usa **webhook** para receber mensagens. Após o deploy, registrar a URL uma vez:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<SEU_DOMINIO_API>/api/webhook/telegram"
```

Substitua `<TELEGRAM_BOT_TOKEN>` pelo token do bot e `<SEU_DOMINIO_API>` pela URL pública do backend (ex.: `api.pagdepix.com`).

### 8.2. Fluxo de verificação

1. Usuário logado chama `POST /auth/request-telegram-verification` → backend gera código de 6 caracteres, salva em `telegramVerifyToken` e `telegramVerifyExpires` (15 min).
2. Frontend exibe o código e o link para o bot.
3. Usuário envia o código no Telegram para @PagDepixBot.
4. Telegram envia o update para `POST /api/webhook/telegram`.
5. Backend valida: código existe, não expirou, username do Telegram bate com o campo `telegram` do usuário. Se válido: marca `telegramVerified = true`, limpa token/expiração e envia mensagem de sucesso pelo bot; se inválido: envia mensagem genérica de erro.

### 8.3. Suporte

O mesmo bot (@PagDepixBot) é usado como canal de suporte na página Suporte do frontend.

---

## 9. Deploy em produção

### 9.1. Backend (ex.: VPS com Node + PM2)

1. Instalar Node.js 20+ e PostgreSQL.
2. Clonar/copiar o projeto, `cd backend`, `npm install --production`, configurar `.env` (DATABASE_URL, JWT_SECRET, TELEGRAM_BOT_TOKEN, SENDGRID_API_KEY, FRONTEND_URL, APP_URL, etc.).
3. Rodar `npx prisma migrate deploy` e `npx prisma generate`.
4. Build: `npm run build`.
5. Iniciar com PM2: `pm2 start dist/server.js --name pagdepix-api`.
6. Configurar Nginx como proxy reverso para a porta do Node (ex.: 3001), com SSL (Let's Encrypt).
7. Garantir que a URL de uploads (`/uploads`) e a URL da API estejam acessíveis e que `APP_URL` reflita a URL pública.

### 9.2. Frontend

1. Definir `VITE_API_URL` com a URL da API em produção (ex.: https://api.pagdepix.com).
2. `npm run build` → saída em `dist/`.
3. Servir `dist/` com Nginx (ou CDN) no domínio do site (ex.: https://pagdepix.com). Configurar fallback para `index.html` (SPA).

### 9.3. Nginx (exemplo mínimo)

- Bloco para API: `proxy_pass http://127.0.0.1:3001`, `proxy_http_version 1.1`, `proxy_set_header Host $host`, `proxy_set_header X-Real-IP $remote_addr`, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, `proxy_set_header X-Forwarded-Proto $scheme`.
- Bloco para frontend: `root /caminho/para/frontend/dist;` + `try_files $uri $uri/ /index.html;`.
- SSL com certificado Let's Encrypt (certbot).

### 9.4. Variáveis de ambiente em produção

- Nunca commitar `.env`. Usar variáveis de ambiente do sistema ou do PM2.
- JWT_SECRET forte e único; TELEGRAM_BOT_TOKEN e SENDGRID_API_KEY válidos; DATABASE_URL apontando para o banco de produção; FRONTEND_URL e APP_URL com HTTPS.

---

## 10. Segurança e boas práticas

- **JWT:** expiração configurada (ex.: 7 dias); em produção usar HTTPS.
- **Senhas:** hash com bcrypt antes de persistir.
- **Rate limiting:** aplicado nas rotas de login, registro e reset de senha; ajustar limites conforme necessidade.
- **Brute force:** proteção por IP e por e-mail (tentativas de login).
- **TXID:** validação de formato (64 caracteres hex) e anti-replay (um TXID por boleto, não reutilizar).
- **Verificação:** usuários precisam verificar e-mail e Telegram (exceto ADMIN) para uso pleno e saque.
- **Admin:** primeiro usuário admin criado manualmente no banco; não expor rotas admin sem checagem de role no backend.
- **Logs:** registrar ações sensíveis (login, criação de boleto, TXID, aprovações, alterações de usuário) para auditoria.
- **Backup:** fazer backup regular do PostgreSQL e, se aplicável, da pasta de uploads (ou do bucket S3).

---

*PagDepix – Documentação Técnica. Para dúvidas, use o canal de suporte @PagDepixBot.*

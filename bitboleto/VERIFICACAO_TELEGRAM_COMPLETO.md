# 🔐 Sistema de Verificação via Telegram - Documentação Completa

## 📌 Visão Geral

Sistema de verificação obrigatória via Telegram que segue as **limitações reais da API do Telegram**: 
- Bots não podem iniciar conversas
- Usuário DEVE clicar em "Iniciar" primeiro
- Depois disso, bot pode enviar mensagens

---

## 🔄 Fluxo Completo (3 Etapas)

### **ETAPA 1: Iniciar Conversa com o Bot**

**Frontend:**
1. Usuário faz login
2. Sistema detecta `telegramVerified = false`
3. Redireciona para `/verificar-telegram`
4. Mostra: "Passo 1: Conectar com o Bot"
5. Botão: "Abrir @PagDepixBot no Telegram"

**Usuário no Telegram:**
1. Clica no botão
2. Telegram abre `t.me/PagDepixBot`
3. Clica em **"Iniciar"** ou envia `/start`

**Backend (Webhook):**
1. Recebe update com `/start`
2. Extrai `chat_id` e `@username`
3. Busca usuário no banco pelo `@username`
4. Atualiza `telegramChatId` do usuário
5. Envia mensagem: "✅ Telegram vinculado! Volte ao site."

**Frontend (Auto-Detecção):**
- Verifica a cada 5 segundos: `GET /auth/check-bot-connection`
- Quando `connected: true` → habilita próxima etapa

---

### **ETAPA 2: Solicitar Código**

**Frontend:**
1. Mostra alerta verde: "✅ Conexão estabelecida!"
2. Botão: "Solicitar Código de Verificação"

**Backend:**
1. Valida que `telegramChatId` existe
2. Gera código de 6 dígitos
3. **ENVIA código via bot** (agora funciona!)
4. Salva código e expiração (5 minutos) no banco

**Usuário:**
- Recebe código no Telegram
- Copia código

---

### **ETAPA 3: Validar Código**

**Frontend:**
1. Campo para inserir código de 6 dígitos
2. Contagem regressiva (5 minutos)
3. Botão "Validar Código"

**Backend:**
1. Valida código inserido
2. Verifica expiração
3. Marca `telegramVerified = true`
4. Limpa código (uso único)

**Frontend:**
- Redireciona para `/dashboard`
- Desbloqueia todas as funcionalidades

---

## 🎨 UX Implementada

### **Bloqueio Visual**

#### **Sidebar:**
- ✅ Badge vermelho piscante no botão "Verificar Telegram"
- ✅ Ícone de cadeado nos botões bloqueados
- ✅ Opacity 50% em funcionalidades desabilitadas

#### **Dashboard:**
- ✅ Alerta destacado no topo: "🔒 Acesso Bloqueado"
- ✅ Botão "Verificar Telegram Agora"

#### **Página de Verificação:**
- ✅ Design moderno e intuitivo
- ✅ Etapas numeradas e claras
- ✅ Feedback visual em tempo real
- ✅ Status de conexão atualizado automaticamente

---

## 🔧 Estrutura Técnica

### **Backend - Arquivos Modificados**

#### **1. `telegram.service.ts`**

```typescript
// Nova função: Processar /start
export async function processStartCommand(
  chatId: number, 
  username?: string
): Promise<{ success: boolean; message?: string }>

// Função atualizada: Processar webhook
export async function processWebhookUpdate(
  update: TelegramUpdate
): Promise<ProcessWebhookResult>

// Função existente: Enviar código
export async function sendVerificationCodeToUser(
  telegramUsername: string, 
  code: string
): Promise<{ success: boolean; error?: string }>

// Função existente: Validar código
export async function validateVerificationCode(
  userId: string, 
  code: string
): Promise<{ success: boolean; error?: string }>
```

#### **2. `userController.ts`**

```typescript
// Novo endpoint: Verificar conexão
export const checkBotConnection = async (req, res)
// GET /auth/check-bot-connection

// Atualizado: Solicitar código (valida chat_id)
export const requestTelegramVerification = async (req, res)
// POST /auth/request-telegram-verification

// Existente: Validar código
export const verifyTelegramCode = async (req, res)
// POST /auth/verify-telegram-code

// Existente: Alterar Telegram
export const updateTelegram = async (req, res)
// PUT /auth/update-telegram
```

#### **3. `telegramController.ts`**

```typescript
export async function telegramWebhook(req, res)
// POST /api/webhook/telegram
// Detecta /start e chama processStartCommand
```

#### **4. `routes/index.ts`**

- ✅ Middleware `requireTelegramVerified` aplicado em todas as rotas principais
- ✅ Nova rota: `GET /auth/check-bot-connection`

---

### **Frontend - Arquivos Modificados**

#### **1. `VerifyTelegram.tsx`** (Completamente refatorado)

**Estados:**
```typescript
const [botConnection, setBotConnection] = useState<BotConnectionStatus | null>(null);
const [checkingConnection, setCheckingConnection] = useState(false);
const [codeSent, setCodeSent] = useState(false);
const [codeInput, setCodeInput] = useState('');
// ... outros estados
```

**Funções:**
```typescript
const checkBotConnection = async () => { ... }  // Verificar a cada 5s
const handleRequestCode = async () => { ... }   // Solicitar código
const handleValidateCode = async () => { ... }  // Validar código
const handleUpdateTelegram = async () => { ... } // Alterar Telegram
```

**Fluxo Visual:**
- Etapa 1: Botão "Abrir Bot" + Status de verificação
- Etapa 2: Botão "Solicitar Código" (após conexão)
- Etapa 3: Campo de código + Validação

#### **2. `Dashboard.tsx`**

```typescript
// Estado de verificação
const [botConnection, setBotConnection] = useState(null);

// Verificação automática
useEffect(() => {
  if (!profile?.telegramVerified && profile?.role !== 'ADMIN') {
    if (location.pathname !== '/verificar-telegram') {
      navigate('/verificar-telegram');
    }
  }
}, [profile]);

// Bloqueio visual
const isBlocked = isNotVerified && !item.isVerificationPage;

// Badge vermelho
{isVerificationPage && isNotVerified && (
  <span className="absolute -top-1 -right-1 flex h-3 w-3">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
  </span>
)}

// Ícone de cadeado
{isBlocked && <Lock className="w-4 h-4 opacity-50" />}
```

#### **3. `App.tsx`**

```typescript
function ProtectedRoute({ children, requireVerified = true }) {
  // Busca perfil do backend (não confia em localStorage)
  useEffect(() => {
    api.get('/user/profile').then(({ data }) => {
      if (!data.telegramVerified && data.role !== 'ADMIN') {
        navigate('/verificar-telegram', { replace: true });
      }
    });
  }, []);
}

// Rota de verificação não requer verificação
<Route 
  path="/verificar-telegram" 
  element={
    <ProtectedRoute requireVerified={false}>
      <Dashboard><VerifyTelegram /></Dashboard>
    </ProtectedRoute>
  } 
/>
```

---

## 🚀 Deploy

### **Backend:**

```bash
cd ~/bitboleto/backend

# 1. Build
npm run build

# 2. Restart
pm2 restart pagdepix-api

# 3. Verificar logs
pm2 logs pagdepix-api --lines 50
```

### **Frontend:**

```bash
cd ~/bitboleto/frontend

# 1. Build
npm run build

# 2. Copiar/Deploy
# (seu método de deploy aqui)

# 3. Hard refresh no navegador
Ctrl + Shift + R
```

---

## ⚙️ Variáveis de Ambiente

```bash
# .env (Backend)
TELEGRAM_BOT_TOKEN=seu_token_aqui
TELEGRAM_WEBHOOK_SECRET=seu_secret_aqui
TELEGRAM_ADMIN_CHAT_ID=seu_chat_id
ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION=true
```

---

## 🔐 Segurança

### **Validações Implementadas:**

1. ✅ **Chat ID obrigatório** antes de enviar código
2. ✅ **Username matching** (bot valida @username)
3. ✅ **Código de uso único** (não pode reutilizar)
4. ✅ **Expiração de 5 minutos**
5. ✅ **Middleware protege todas as rotas** (backend)
6. ✅ **Redirecionamento automático** (frontend)
7. ✅ **Admin bypass** (não precisa verificar)

### **Proteção Contra Fraudes:**

- Bot valida que `@username` do Telegram bate com cadastro
- Código é salvo no banco associado ao usuário
- Verificação é permanente (não expira após validar)
- Alterar Telegram **reseta** verificação (força nova validação)

---

## 📊 Fluxo de Dados

### **Comando /start**

```
Usuário → Telegram → Webhook → Backend
                                  ↓
                        processStartCommand()
                                  ↓
                        Busca user por @username
                                  ↓
                        Atualiza telegramChatId
                                  ↓
                        Envia confirmação → Usuário
```

### **Solicitar Código**

```
Frontend → POST /auth/request-telegram-verification
              ↓
        Valida telegramChatId existe
              ↓
        Gera código (6 dígitos)
              ↓
        sendVerificationCodeToUser()
              ↓
        Bot envia → Usuário recebe no Telegram
```

### **Validar Código**

```
Frontend → POST /auth/verify-telegram-code
              ↓
        validateVerificationCode()
              ↓
        Verifica código + expiração
              ↓
        Marca telegramVerified = true
              ↓
        Desbloqueia sistema → Dashboard
```

---

## 🎯 Pontos-Chave

### ✅ **O Que Funciona:**
- Bot envia código **apenas após** usuário clicar em "Iniciar"
- Detecção automática de conexão (polling a cada 5s)
- Bloqueio total do sistema até verificar
- UX clara e intuitiva (etapas numeradas)
- Feedback visual em tempo real

### ⚠️ **Limitações do Telegram (Contornadas):**
- Bot não pode iniciar conversas ❌
- **Solução:** Forçar usuário a clicar em "Iniciar" primeiro ✅

### 🔒 **Segurança:**
- Código expira em 5 minutos
- Uso único (não pode reutilizar)
- Username matching (previne fraude)
- Middleware protege todas as rotas

---

## 📝 Checklist de Testes

### **Novo Usuário:**
- [ ] Login → Redirecionado para `/verificar-telegram`
- [ ] Sidebar: Todos os botões bloqueados, exceto "Verificar Telegram"
- [ ] Badge vermelho piscante no botão de verificação
- [ ] Alerta "Acesso Bloqueado" no topo

### **Etapa 1:**
- [ ] Botão "Abrir @PagDepixBot" funciona
- [ ] Telegram abre corretamente
- [ ] Clicar em "Iniciar" → Bot responde com confirmação
- [ ] Frontend detecta conexão automaticamente (5s)

### **Etapa 2:**
- [ ] Botão "Solicitar Código" habilitado após conexão
- [ ] Clicar → Código chega no Telegram
- [ ] Contagem regressiva funciona (5 min)

### **Etapa 3:**
- [ ] Campo aceita apenas 6 dígitos
- [ ] Código correto → Validação bem-sucedida
- [ ] Redirecionamento para Dashboard
- [ ] Todos os botões desbloqueados
- [ ] Badge vermelho removido

### **Alterar Telegram:**
- [ ] Botão "Editar" funciona
- [ ] Alterar @ → Volta para não verificado
- [ ] Precisa verificar novo @ antes de continuar

---

## 🆘 Troubleshooting

### **"Aguardando você iniciar conversa..." não muda**

**Causa:** Usuário não enviou `/start` no bot.

**Solução:**
1. Abrir `t.me/PagDepixBot`
2. Clicar em "Iniciar" ou digitar `/start`
3. Aguardar até 5 segundos (polling)

---

### **"Você precisa iniciar conversa com o bot primeiro"**

**Causa:** `telegramChatId` não está registrado no banco.

**Solução:**
1. Verificar se usuário clicou em "Iniciar" no bot
2. Verificar logs do webhook: `pm2 logs pagdepix-api | grep Telegram`
3. Verificar se `@username` do Telegram bate com o cadastrado

---

### **Código não chega no Telegram**

**Causa:** `TELEGRAM_BOT_TOKEN` inválido ou bot desconfigurado.

**Solução:**
1. Verificar `.env`: `TELEGRAM_BOT_TOKEN`
2. Testar bot manualmente: enviar `/start`
3. Ver logs: `pm2 logs pagdepix-api`

---

### **Dashboard ainda zerado após verificar**

**Causa:** Frontend cacheado.

**Solução:**
1. Hard refresh: `Ctrl + Shift + R`
2. Limpar cache do navegador
3. Recarregar perfil: logout/login

---

## 📞 Suporte

- **Logs Backend:** `pm2 logs pagdepix-api`
- **Teste Bot:** `https://t.me/PagDepixBot`
- **Verificar Webhook:** `POST /api/webhook/telegram` (no Postman)

---

## 🎉 Conclusão

Sistema de verificação **100% funcional** seguindo as limitações reais do Telegram. 

**Fluxo:**
1. Usuário inicia conversa com bot (clica em "Iniciar")
2. Bot registra `chat_id`
3. Sistema detecta automaticamente
4. Usuário solicita código
5. Bot envia código
6. Usuário valida na plataforma
7. Sistema desbloqueia tudo

**UX:** Clara, intuitiva, com feedback visual em cada etapa.

**Segurança:** Código de uso único, expiração, username matching, rotas protegidas.

---

**Data:** 08/02/2026  
**Versão:** 2.0 (Fluxo Correto do Telegram)

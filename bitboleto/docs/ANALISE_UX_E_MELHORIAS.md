# Análise UX e Proposta de Melhorias – PagDepix

Este documento consolida a análise da experiência do usuário final (UX), transparência financeira, suporte e propostas de novos recursos (incluindo chat em tempo real e painel de tickets).

---

## 1. Análise da experiência do usuário final (UX)

### 1.1 Pontos positivos identificados

- **Navegação clara**: Sidebar com ícones e labels (Dashboard, Pagar Boleto, Recarga, Comprar Depix, Histórico, Suporte, etc.) e header contextual com título e descrição da página.
- **Histórico unificado**: Página de Histórico com abas/filtros por tipo (boletos, recargas, depix) e busca, permitindo visão única das operações.
- **Fluxos principais bem definidos**: Pagar Boleto, Recarga e Comprar Depix com etapas claras (valor, cupom, pagamento, TXID).
- **Suporte visível**: Aba "Suporte" na sidebar com link para Telegram, FAQ e avisos importantes.
- **Feedback visual**: Estados de loading, mensagens de erro e confirmações (ex.: "Copiado!" em links).

### 1.2 Pontos de melhoria (UX)

| Área | Problema | Sugestão |
|------|----------|----------|
| **Dashboard** | "Total Processado" não inclui recargas nem Comprar Depix; gera confusão e desconfiança. | Unificar totais (ver seção 2). |
| **Dashboard** | Limite diário exibido como "usado hoje" pode não refletir Depix (dependendo da regra de negócio). | Deixar explícito o que entra no limite (boletos + recargas) e, se Depix contar, incluir no cálculo. |
| **Configurações** | "Total Pago" (totalPaid) idem: só boletos. | Mesma unificação do dashboard. |
| **Suporte** | Única opção é sair da plataforma (Telegram); não há histórico nem contexto da conta. | Oferecer chat in-app + manter Telegram (seção 4). |
| **Histórico** | Filtros e busca bons; falta indicador de "total gasto" por período ou por tipo. | Card resumo: "Total em boletos / recargas / depix" no topo ou em filtros. |
| **Erros** | Uso de `alert()` e mensagens genéricas em vários fluxos. | Padronizar toasts ou banners de erro/sucesso e mensagens amigáveis. |
| **Mobile** | Sidebar em overlay; ações rápidas no dashboard podem ser mais touch-friendly. | Revisar tamanho de toque e hierarquia em telas pequenas. |
| **Onboarding** | Novos usuários podem não saber o que é "Depix", "TXID" ou "Liquid". | Tooltips, link "Como funciona" ou pequeno tour na primeira visita. |

---

## 2. Total processado: unificação e transparência

### 2.1 Situação atual

- **Backend**: O campo `User.totalPaid` é incrementado **apenas** quando um **boleto** é aprovado em `adminController.approveBoleto`.
- **Recargas**: Ao aprovar recarga (`adminApproveRechargeWithReceipt` / `adminMarkRechargePaid` em `mobileRecharge.ts`), o usuário **não** tem o `totalPaid` atualizado.
- **Comprar Depix**: Pedidos em `DepixOrder` com status final (ex.: `depix_sent`) **não** atualizam `totalPaid`.
- **Frontend**: Dashboard e Configurações exibem `user.totalPaid` como "Total Processado" / "Total Pago", sugerindo que é o total geral, quando na prática é só boletos.

### 2.2 Proposta de unificação

**Opção A – Manter um único total (recomendada para simplicidade)**

1. **Definição**: "Total processado" = soma de (boletos PAID) + (recargas PAID) + (Depix concluídos, ex.: `depix_sent`).
2. **Implementação**:
   - **Ao aprovar boleto**: manter o `increment` em `totalPaid` (já existe).
   - **Ao aprovar recarga**: no mesmo fluxo (ex.: em `adminApproveRechargeWithReceipt` ou na rota `/admin/recharge/:id/approve`), após marcar a recarga como PAID, fazer `User.totalPaid += recharge.totalAmount`.
   - **Comprar Depix**: quando o status do pedido for atualizado para `depix_sent` (no sync/callback que já atualiza `DepixOrder`), incrementar `User.totalPaid` com `order.totalToPay` (uma vez por pedido, evitando duplicar se o job rodar várias vezes).
3. **Consistência**: Criar um job ou endpoint de "recalcular totalPaid" (soma de Boleto PAID + MobileRecharge PAID + DepixOrder depix_sent) para corrigir dados antigos e para auditoria.

**Opção B – Exibir totais separados**

- No perfil/dashboard retornar, por exemplo: `totalBoletos`, `totalRecargas`, `totalDepix` (calculados por agregação) e `totalGeral` = soma dos três.
- Frontend exibe um card "Total processado" com o total geral e, opcionalmente, breakdown (tooltip ou seção "Detalhes").

Recomendação: **Opção A** para um único número claro; se quiser mais transparência, adicionar no mesmo endpoint um breakdown opcional (totais por tipo) para exibir em "Detalhes" ou Configurações.

### 2.3 Limite diário ("usado hoje")

- Hoje `usedToday` no perfil já considera **boletos + recargas** criados no dia (PENDING/PAID). **Depix** não entra.
- A verificação de limite diário em **criação de boleto** (`createBoleto`) considera apenas **boletos** do dia. Se a regra de negócio for "limite único para tudo", é preciso:
  - Incluir recargas (e eventualmente Depix) no cálculo de `totalHoje` em `createBoleto`;
  - E no fluxo de criação de recarga/Depix usar o mesmo teto (ex.: mesmo `usedToday` do perfil).

Assim, o valor "R$ X de R$ Y hoje" no dashboard fica alinhado ao que de fato bloqueia novas operações.

---

## 3. Novos recursos para suporte (confiança, agilidade, satisfação)

- **FAQ contextual**: Na página de Suporte, manter FAQ; adicionar links "Enviar esta dúvida ao suporte" para pré-preencher o assunto do chat/ticket.
- **Status de operação**: Na tela de Histórico (e se possível no Dashboard), mostrar status claro (ex.: "Aguardando aprovação", "Pago", "Depix enviado") e prazos médios ("Aprovação em até 1h em dias úteis").
- **Notificações in-app**: Além do Telegram, exibir um sino com avisos (ex.: "Boleto aprovado", "Recarga liquidada") para quem está logado.
- **Chat in-app**: Ver seção 4.
- **Telegram**: Manter como canal alternativo; na página Suporte deixar explícito: "Prefere Telegram? Abra @PagDepixBot."

---

## 4. Chat de atendimento em tempo real

### 4.1 Viabilidade e benefícios

- **Viabilidade**: Alta. Soluções possíveis:
  - **WebSockets** (Socket.io no backend + React no frontend): controle total, dados no seu banco, sem custo de assinatura.
  - **Serviços managed** (Sendbird, Stream, Intercom, Zendesk): menos desenvolvimento, custo mensal, integração com APIs.
- **Benefícios**:
  - Usuário não precisa sair da plataforma; contexto (conta, histórico) pode ser enviado junto ao primeiro contato.
  - Histórico de conversas no próprio painel, vinculado ao usuário.
  - Múltiplos atendentes e fila de tickets (seção 4.3).
  - Reduz dependência de um único canal (Telegram) e melhora percepção de suporte.

### 4.2 Funcionalidades sugeridas (lado usuário)

- Acesso pela **aba Suporte** na sidebar: mesma rota `/suporte`, com seção "Chat com o PagDepix" além do link do Telegram.
- **Início de conversa**: Botão "Iniciar chat" que abre um ticket (ou reabre o último aberto).
- **Chat em tempo real**: Lista de mensagens (usuário / atendente), campo de texto e envio; se usar WebSockets, atualização imediata; fallback com polling a cada X segundos.
- **Histórico**: Carregar mensagens anteriores do ticket atual; em lista de tickets, exibir último ticket e status (aberto / em andamento / resolvido).

### 4.3 Painel administrativo – Dashboard do chat

Proposta de estrutura no **Admin** (nova aba, ex.: "Chat" ou "Atendimento"):

| Recurso | Descrição |
|--------|-----------|
| **Tickets por usuário** | Lista de tickets; cada ticket associado a um usuário (id, nome, email, telegram). Clique abre a conversa. |
| **Status** | Aberto / Em andamento / Resolvido (e opcionalmente "Fechado"). Filtro por status. |
| **Histórico de mensagens** | Todas as mensagens do ticket em ordem cronológica; indicar remetente (usuário vs atendente). |
| **Múltiplos atendentes** | Cada mensagem do atendente pode ter `attendantId` (User ADMIN). Lista de tickets pode mostrar "Atendido por" e permitir "Assumir" para o admin logado. |
| **Filtros** | Por data (abertura/última mensagem), por cliente (nome/email), por prioridade (se implementar campo prioridade). |
| **Notificações** | Badge ou contador de tickets "Abertos" ou "Em andamento"; opcional: notificação em tempo real quando chega nova mensagem. |

### 4.4 Modelo de dados sugerido (Prisma)

```prisma
model SupportTicket {
  id         String   @id @default(uuid())
  userId     String
  status     String   @default("OPEN")   // OPEN | IN_PROGRESS | RESOLVED
  priority   String?  @default("NORMAL") // LOW | NORMAL | HIGH (opcional)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user     User     @relation(fields: [userId], references: [id])
  messages SupportMessage[]
  @@index([userId])
  @@index([status])
  @@index([createdAt])
}

model SupportMessage {
  id        String   @id @default(uuid())
  ticketId  String
  senderId  String   // userId (usuário) ou attendantId (admin)
  isStaff   Boolean  @default(false)
  content   String
  createdAt DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@index([ticketId])
}
```

- **WebSocket**: evento `support:message` (enviar/receber mensagem); ao criar mensagem, salvar no banco e emitir para o canal do ticket (e para o painel admin).
- **REST**: `GET /support/tickets` (meus tickets), `POST /support/tickets` (abrir), `GET /support/tickets/:id/messages`, `POST /support/tickets/:id/messages`; admin: `GET /admin/support/tickets` (com filtros), `PATCH /admin/support/tickets/:id` (status), `POST /admin/support/tickets/:id/messages`.

---

## 5. Sugestões práticas priorizadas

### 5.1 Usabilidade

1. **Unificar "Total processado"** (boletos + recargas + depix) no backend e exibir no Dashboard e Configurações (e, se desejado, breakdown por tipo).
2. **Alinhar limite diário**: Incluir recargas (e Depix, se fizer parte do limite) no cálculo de "usado hoje" e na validação de criação de boleto/recarga.
3. **Substituir `alert()`** por componente de toast ou banner de sucesso/erro reutilizável.
4. **Tooltips/ajuda**: Em termos como "TXID", "Depix", "Liquid", adicionar ícone de ajuda com texto curto ou link para Regras/FAQ.
5. **Histórico**: Card resumo com totais por tipo (boletos, recargas, depix) no topo da página Histórico.

### 5.2 Transparência financeira

1. **Recargas e Depix no total processado**: Implementar incremento de `totalPaid` na aprovação de recarga e na conclusão de Depix (status `depix_sent`), além do boleto (já existente).
2. **Script de recálculo**: Endpoint ou script admin para recalcular `totalPaid` a partir das tabelas (Boleto, MobileRecharge, DepixOrder) e corrigir inconsistências.
3. **Dashboard**: Manter um único "Total processado" (soma) e opcionalmente "Detalhes" com valores por serviço.

### 5.3 Eficiência no suporte

1. **Chat in-app**: Implementar tickets + mensagens (WebSocket ou serviço managed) na aba Suporte, com histórico e painel admin (tickets, status, filtros, múltiplos atendentes).
2. **Manter Telegram** como opção na mesma página Suporte.
3. **FAQ + contexto**: Botão "Enviar esta dúvida ao suporte" em cada pergunta do FAQ para abrir o chat com assunto pré-preenchido.

### 5.4 Escalabilidade e manutenção

- **Total processado**: Centralizar a lógica de incremento em um serviço (ex.: `userTransactionService.incrementTotalPaid(userId, amount, type: 'boleto'|'recharge'|'depix')`) para evitar esquecer algum fluxo.
- **Chat**: Manter modelos e APIs de suporte em módulo separado (ex.: `support/` ou `chat/`); WebSocket em namespace `/support` para não misturar com outros eventos.
- **Feature flags**: Se o chat for lançado gradualmente, usar flag (ex.: env ou config) para mostrar/ocultar "Chat" na Suporte e aba Admin.

---

## 6. Resumo executivo

| Prioridade | Item | Impacto |
|-----------|------|--------|
| Alta | Unificar total processado (boletos + recargas + depix) no backend e na UI | Transparência e confiança |
| Alta | Incluir recargas (e depix se aplicável) no limite diário e no "usado hoje" | Consistência e clareza |
| Média | Chat in-app na aba Suporte + painel admin (tickets, status, histórico, filtros) | Suporte mais ágil e profissional |
| Média | Substituir alerts por toasts; melhorar mensagens de erro | UX e acessibilidade |
| Baixa | Breakdown "Total por tipo" e resumo no Histórico | Transparência e análise pessoal |
| Baixa | Tooltips/ajuda para termos técnicos | Onboarding e redução de dúvidas |

A implementação do total unificado e do limite diário consistente pode ser feita primeiro (baixo risco, alto retorno). O chat em tempo real é um passo seguinte maior, mas com benefício claro para satisfação e eficiência do suporte, podendo ser entregue em fases (MVP: um ticket por usuário + mensagens + status; depois: múltiplos atendentes, prioridade, notificações).

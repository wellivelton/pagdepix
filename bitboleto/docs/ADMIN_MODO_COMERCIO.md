# Admin: gestão de usuários pessoais e comerciantes

## Visão geral

O admin deve conseguir gerenciar **todos os usuários** num só lugar, com filtro por tipo e ações específicas para comerciantes.

---

## 1. Lista de usuários (unificada)

- **Uma única aba "Usuários"** com todos os tipos: pessoal (USER), comerciantes (COMMERCE), afiliados (AFFILIATE).
- **Filtro por tipo:** Todos | Pessoal | Comerciantes | Afiliados.
- **Busca:** por nome, e-mail ou Telegram (já existe).
- **Colunas úteis:** Nome, E-mail, Telegram, **Tipo** (Pessoal / Comerciante / Afiliado), Status (ativo/bloqueado), Limite diário, Total pago, Último login.
- **Para comerciantes:** exibir também **Status do parceiro** (Pendente / Aprovado / Rejeitado), **Tipo de negócio**, Documento (mascarado, ex.: ***.***.***-12).

---

## 2. Ações comuns (todos os usuários)

- **Bloquear / Desbloquear** – impede login.
- **Ativar / Desativar** – desativa sem bloquear (conta inativa).
- **Alterar limite diário** – valor em R$ para uso pessoal.
- **Liberar valor máximo de boleto** – para contas que precisam pagar boletos acima de R$ 1.000.
- **Excluir conta** – anonimiza e desativa (já existe).

---

## 3. Ações específicas para comerciantes

- **Aprovar Modo Comércio** – marca o parceiro como `APPROVED`. Hoje o login já funciona com role COMMERCE; aprovação pode ser usada para:
  - Controle/KYC (só quem foi aprovado pode usar links/páginas no futuro).
  - Exibir “Aprovado” na lista para o admin.
- **Rejeitar Modo Comércio** – marca como `REJECTED` (ou mantém `PENDING` e bloqueia o usuário). Opcional: notificar por e-mail/Telegram.

Assim o admin vê quem pediu Modo Comércio, quem está pendente e quem já foi aprovado/rejeitado.

---

## 4. Fluxo sugerido

1. **Cadastro** – Comerciante se cadastra na página pública → usuário criado com `role: COMMERCE` e `CommercePartner` com `status: PENDING`.
2. **Admin** – Na aba Usuários, filtra por “Comerciantes” ou vê na lista quem é comerciante e qual o status (Pendente / Aprovado / Rejeitado).
3. **Aprovação** – Admin clica em “Aprovar” → `CommercePartner.status = APPROVED`. (Opcional: no futuro, só usuários APPROVED podem criar links/páginas.)
4. **Rejeição** – Admin clica em “Rejeitar” → `CommercePartner.status = REJECTED` e, se quiser, bloqueia o usuário.

---

## 5. Backend (já previsto)

- **GET /admin/users?role=USER|COMMERCE|AFFILIATE** – filtro por tipo; resposta inclui `commercePartner` (status, businessType, documentType, createdAt) quando existir.
- **POST /admin/users/:id/action** – body `{ action: 'approve_commerce' }` ou `{ action: 'reject_commerce' }` para atualizar o status do parceiro.

---

## 6. Frontend Admin (a fazer)

- Na aba Usuários: dropdown ou abas para filtro **Todos | Pessoal | Comerciantes | Afiliados**.
- Na linha do usuário: badge **Comerciante** com status (Pendente / Aprovado / Rejeitado).
- Botões **Aprovar** e **Rejeitar** apenas para usuários com `role === 'COMMERCE'` e `commercePartner.status === 'PENDING'`.
- Máscara de documento (CPF/CNPJ) ao exibir para o admin.

Com isso, o admin consegue gerenciar usuários pessoais e comerciantes na mesma tela, com ações comuns e específicas para o Modo Comércio.

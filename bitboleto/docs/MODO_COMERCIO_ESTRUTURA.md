# Estrutura do Modo Comércio – Boas práticas

## Objetivo
Manter o **Modo Comércio** totalmente separado do modo normal em **rotas, páginas e layout**, usando o **mesmo banco de dados** e a mesma base de autenticação.

---

## 1. Rotas

- **Prefixo único:** todas as rotas do app comércio ficam sob `/comercio/...`.
- **Página pública:** `/comercio` → landing explicativa (já existe).
- **App do parceiro:**
  - `/comercio/dashboard` → início / resumo
  - `/comercio/links` → links de pagamento (criar/listar)
  - `/comercio/paginas` → páginas pré-prontas com valores
  - `/comercio/historico` → histórico de transações do comércio
  - `/comercio/config` → configurações do comércio

Assim fica claro o que é “app normal” (`/dashboard`, `/pagar`, …) e o que é “app comércio” (`/comercio/*`).

---

## 2. Organização do código (frontend)

```
frontend/src/
├── pages/
│   ├── ModoComercio.tsx          # Landing pública (já existe)
│   ├── comercio/                 # Páginas do app comércio
│   │   ├── ComercioLayout.tsx    # Layout com sidebar próprio
│   │   ├── ComercioDashboard.tsx # Início / resumo
│   │   ├── ComercioLinks.tsx     # Links de pagamento
│   │   ├── ComercioPaginas.tsx   # Páginas pré-prontas
│   │   ├── ComercioHistorico.tsx # Histórico
│   │   └── ComercioConfig.tsx    # Configurações
│   ├── Dashboard.tsx             # Layout modo normal
│   ├── History.tsx
│   └── ...
├── services/
│   └── api.ts                    # Mesmo cliente; endpoints /commerce/*
└── App.tsx                       # Rotas + CommerceRoute
```

- **Reuso:** componentes genéricos (botões, inputs, cards) podem ficar em `components/` e ser usados nos dois modos.
- **Separação:** tudo que é só do comércio fica em `pages/comercio/` e usa o **ComercioLayout** (sidebar e navegação próprios).

---

## 3. Layout do Modo Comércio

- **Um layout dedicado:** `ComercioLayout` com:
  - Sidebar com: Início, Links de pagamento, Páginas pré-prontas, Histórico, Configurações, Sair.
  - Sem itens do modo normal (Pagar Boleto, Recarga, Comprar Depix, etc.).
- Mesmo padrão visual (cores, `focusRing`, responsivo) que o resto do app.

---

## 4. Autenticação e acesso

- **Mesmo login:** token e usuário vêm do mesmo fluxo (login atual).
- **Controle no backend:** identificar “parceiro comércio” por:
  - **Opção A:** novo valor no enum `Role`, por exemplo `COMMERCE` (usuário só comércio ou comércio+user).
  - **Opção B:** tabela `CommercePartner` (ou flag `isCommercePartner` no User), permitindo o mesmo usuário ter conta normal e comércio.
- **No frontend:** um guard **CommerceRoute**:
  - Exige estar logado (como o `ProtectedRoute`).
  - Exige ser parceiro comércio (role ou flag).
  - Se não for, redireciona para `/comercio` (landing) ou `/dashboard` com mensagem.
- Rotas `/comercio/dashboard`, `/comercio/links`, etc. ficam todas dentro de `CommerceRoute` + `ComercioLayout`.

---

## 5. API (backend)

- **Mesmo banco, endpoints separados:** prefixo tipo `/api/commerce/` ou `/api/comercio/`:
  - `GET /commerce/dashboard` – resumo (volume, transações, etc.)
  - `GET/POST /commerce/links` – links de pagamento
  - `GET/POST /commerce/pages` – páginas pré-prontas
  - `GET /commerce/transactions` – histórico
  - `GET/PUT /commerce/settings` – configurações do parceiro
- Autenticação: mesmo middleware (JWT); dentro do controller verificar se o usuário é parceiro comércio (role ou relação).

---

## 6. Resumo

| Aspecto              | Modo normal     | Modo comércio        |
|----------------------|-----------------|----------------------|
| Rotas                | `/dashboard`, … | `/comercio/dashboard`, … |
| Layout               | `Dashboard`     | `ComercioLayout`     |
| Páginas              | `pages/*.tsx`   | `pages/comercio/*.tsx` |
| Guard                | `ProtectedRoute`| `CommerceRoute`      |
| API                  | `/api/...`      | `/api/commerce/...`  |
| Banco                | Mesmo           | Mesmo                |
| Login / token        | Mesmo           | Mesmo                |

Isso mantém o modo comércio separado em UI e fluxo, sem duplicar auth nem banco.

---

## 7. Padronização mobile / desktop

Em **todas as páginas novas** (públicas e do app), manter o mesmo padrão do Dashboard:

- **Mobile (default):** mais compacto — caber mais na tela.
  - Títulos: `text-xl` ou `text-base` (h1/h2), `text-xs` para subtítulos.
  - Texto corpo: `text-xs` ou `text-sm`.
  - Ícones: `w-4 h-4` ou `w-3.5 h-3.5`.
  - Padding/seções: `p-4`, `py-4`, `space-y-4`, `gap-1.5`, `rounded-lg`.
- **Desktop (md:):** maior e confortável.
  - Títulos: `md:text-2xl`, `md:text-4xl`, `md:text-base` para subtítulos.
  - Texto corpo: `md:text-base`.
  - Ícones: `md:w-5 md:h-5` ou `md:w-6 md:h-6`.
  - Padding/seções: `md:p-6`/`md:p-8`, `md:py-12`, `md:space-y-8`, `md:gap-2`, `md:rounded-xl`/`md:rounded-2xl`.
- Sempre usar `focusRing` em botões/links e `flex-shrink-0` em ícones dentro de flex.

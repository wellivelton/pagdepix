# Refatoração do Cadastro de Produtos – Físicos e Digitais

Documentação das mudanças realizadas para separar corretamente o fluxo de cadastro entre **produtos físicos** e **produtos digitais**.

---

## Resumo das alterações

O formulário de cadastro de produtos foi refatorado para:

1. **Separar claramente** produtos físicos e digitais desde a primeira pergunta
2. **Exibir apenas campos relevantes** para cada tipo
3. **Usar categorias adequadas** por tipo (digitais vs físicas)
4. **Evitar mistura** de lógica de entrega (LINK/FILE/CODE vs SHIPPING)

---

## Arquivos modificados

### Backend

| Arquivo | Alteração |
|---------|-----------|
| `backend/prisma/schema.prisma` | Inclusão de categorias físicas (ELECTRONICS, CLOTHING, BOOKS, HOME, SPORTS, BEAUTY, TOYS, OTHER) em `ProductCategory` e `SHIPPING` em `DeliveryType` |
| `backend/src/controllers/marketplace/productController.ts` | Lógica condicional em `createProduct`, `updateProduct` e `submitForApproval` para produtos físicos vs digitais |
| `backend/src/services/marketplace/deliveryV2.service.ts` | Tratamento para produtos físicos (não entrega digital; item permanece pendente para envio pelo vendedor) |

### Frontend

| Arquivo | Alteração |
|---------|-----------|
| `frontend/src/pages/comercio/CreateProduct.tsx` | Primeira pergunta sobre tipo (físico/digital); categorias e campos condicionais por tipo |
| `frontend/src/pages/comercio/EditProduct.tsx` | Mesma lógica condicional; blocos de frete apenas para físicos; tipo de entrega apenas para digitais |
| `frontend/src/pages/marketplace/Marketplace.tsx` | Importa `CATEGORY_LABELS` centralizado; fallback de categorias inclui físicas |
| `frontend/src/pages/comercio/SellerProducts.tsx` | Uso de `CATEGORY_LABELS` centralizado |
| `frontend/src/components/marketplace/ProductCard.tsx` | Exibe label amigável da categoria via `CATEGORY_LABELS` |

---

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `frontend/src/constants/productForm.ts` | Constantes centralizadas: `CATEGORIES_DIGITAL`, `CATEGORIES_PHYSICAL`, `DELIVERY_TYPES_DIGITAL`, `PRODUCT_TYPES`, `CATEGORY_LABELS`, validações |
| `backend/prisma/migrations/20260308130000_add_physical_product_categories_and_shipping/migration.sql` | Migração para novos valores nos enums `ProductCategory` e `DeliveryType` |
| `docs/REFATORACAO_CADASTRO_PRODUTOS.md` | Este documento |

---

## Mudanças no banco de dados

### Enum `ProductCategory`

**Valores adicionados (produtos físicos):**

- `ELECTRONICS` – Eletrônicos  
- `CLOTHING` – Roupas e Moda  
- `BOOKS` – Livros Físicos  
- `HOME` – Casa e Decoração  
- `SPORTS` – Esportes  
- `BEAUTY` – Beleza e Saúde  
- `TOYS` – Brinquedos  
- `OTHER` – Outros  

**Valores existentes (produtos digitais):** EBOOK, SOFTWARE, COURSE, DESIGN, GIFTCARD

### Enum `DeliveryType`

**Valor adicionado:**

- `SHIPPING` – Entrega física (envio pelos Correios)

**Valores existentes (produtos digitais):** FILE, CODE, LINK

---

## Comandos necessários

### 1. Aplicar migração no banco de dados

```bash
cd backend
npx prisma migrate deploy
```

Ou, em ambiente de desenvolvimento com histórico de migrações:

```bash
cd backend
npx prisma migrate dev
```

### 2. Regenerar o Prisma Client (se necessário)

```bash
cd backend
npx prisma generate
```

### 3. Rebuild do frontend

```bash
cd frontend
npm run build
```

### 4. Rodar em desenvolvimento

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

---

## Fluxo de cadastro após refatoração

### Produto digital

1. Vendedor escolhe **Produto digital**
2. Seleciona categoria digital (E-book, Software, Curso, Design, Gift Card)
3. Define tipo de entrega: Arquivo, Código ou Link
4. Se Link: preenche URL de entrega
5. Se Arquivo: faz upload dos arquivos após aprovação
6. Se Código: cadastra códigos após aprovação
7. **Não exibe** campos de peso, dimensões ou CEP de origem

### Produto físico

1. Vendedor escolhe **Produto físico**
2. Seleciona categoria física (Eletrônicos, Roupas, Livros, etc.)
3. Preenche **peso (kg)**, **dimensões (cm)** e **CEP de origem**
4. **Não exibe** tipo de entrega (FILE/CODE/LINK) – entrega é sempre SHIPPING
5. **Não exibe** campos de link, arquivo ou código
6. Após venda, o vendedor envia o produto (integração futura com etiquetas de frete)

---

## Validações aplicadas

### Backend (`submitForApproval`)

- **Produto físico:** exige `weightKg` > 0 e `originCep` válido (8 dígitos)
- **Produto digital:** exige entrega configurada (arquivos, códigos ou link conforme `deliveryType`)

### Frontend

- Tipo de produto obrigatório
- Categoria adequada ao tipo
- Para físicos: peso, dimensões e CEP obrigatórios
- Para digitais: tipo de entrega obrigatório; link obrigatório quando `deliveryType === 'LINK'`

---

## Preparação para integrações futuras

A estrutura permite integração com:

- **Correios / transportadoras:** uso de `weightKg`, `lengthCm`, `widthCm`, `heightCm`, `originCep`
- **Geração de etiquetas de frete:** `deliveryType === 'SHIPPING'` identifica produtos físicos
- **Rastreamento:** campos já existentes no modelo `Shipment` e no fluxo de pedidos

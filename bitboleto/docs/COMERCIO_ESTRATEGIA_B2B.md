# PagDepix Commerce – Estratégia B2B Completa

Documento estratégico para posicionar o Modo Comércio como principal motor de crescimento do PagDepix.

---

## 1. Estrutura da Landing Page (implementada)

### Headline
> **Receba pagamentos em DePix. Sem custódia. Confirmação automática.**

### Subheadline
> Seus clientes pagam via Pix. Você recebe em DePix direto na sua carteira Liquid. Nenhuma empresa guarda seu dinheiro.

### Seções
1. **Hero** – Headline, subheadline, 2 CTAs (Ativar | Integrar via API)
2. **Prova de confiança** – Sem custódia, Liquid Network, Confirmação automática, API REST
3. **Benefícios** – 4 cards (Confirmação rápida, Sem custódia, Links/páginas, Antifraude)
4. **Como funciona** – 3 passos (CNPJ → Carteira → Receba)
5. **API para desenvolvedores** – Lista de recursos + CTA Telegram
6. **FAQ** – 5 perguntas estratégicas
7. **CTA final** – Ativar Modo Comércio + Voltar ao início

### CTAs
- **Primário**: "Ativar Modo Comércio" → `/login` com redirect para `/comercio/ativar`
- **Secundário**: "Integrar via API" → Telegram @PagDepixBot

### Gatilhos mentais aplicados
- **Urgência/escassez**: "Ative em minutos"
- **Prova social implícita**: Trust badges (Liquid, sem custódia)
- **Autoridade**: Validação CNPJ, antifraude
- **Reciprocidade**: Transparência nas taxas (0,5% + R$ 0,99)
- **Compromisso gradual**: CTA claro, FAQ reduz objeções

---

## 2. Estratégia de SEO

### Palavras-chave principais
- gateway de pagamento cripto
- receber pagamentos DePix
- gateway pagamento comerciante Brasil
- Liquid Network pagamentos
- receber Pix como DePix

### Palavras-chave secundárias
- API pagamentos cripto Brasil
- pagamento sem custódia
- converter Pix em DePix
- receber pagamentos sem banco
- gateway DePix comerciante

### Estrutura de headings
- **H1**: Receba pagamentos em DePix. Sem custódia. Confirmação automática.
- **H2**: Por que PagDepix Commerce? | Como funciona | API para desenvolvedores | Perguntas frequentes
- **H3**: Benefícios (4 cards) | Etapas (3 passos) | Itens FAQ

### Meta description
> Receba pagamentos via Pix com conversão automática em DePix. Confirmação em minutos, sem custódia, direto na sua carteira Liquid. Links, páginas e API para integração.

### Conteúdo complementar (blog/docs)
- "Como receber pagamentos em DePix no seu negócio"
- "Gateway de pagamento cripto: guia para comerciantes"
- "Integrar PagDepix via API: tutorial passo a passo"
- "Liquid Network: o que é e por que usar para pagamentos"

---

## 3. Estrutura técnica da API

Ver documento: [API_COMERCIO_GATEWAY.md](./API_COMERCIO_GATEWAY.md)

### Endpoints principais
- `POST /commerce/api/charges` – Criar cobrança
- `GET /commerce/api/charges/:id` – Consultar status
- `POST /commerce/api/links` – Gerar link de pagamento
- Webhooks: `charge.paid`, `charge.expired`, etc.
- `GET /commerce/api/reports/transactions` – Relatórios

### Autenticação
- Bearer token ou X-API-Key + X-API-Secret
- API Key por comerciante (produção/sandbox)

---

## 4. Estratégia de posicionamento

### Para comerciantes
- **Proposta**: "Receba pagamentos sem passar por banco. Seus clientes pagam Pix, você recebe DePix direto na carteira."
- **Diferencial**: Confirmação automática, sem custódia, Liquid Network

### vs Gateways tradicionais (Mercado Pago, PagSeguro)
- Não bloqueia dinheiro; recebe direto na carteira
- Taxas competitivas (0,5% + R$ 0,99)
- Sem chargeback típico de cartão (Pix → DePix é irreversível após confirmação)

### vs Exchanges
- Foco em recebimento de pagamentos, não em trading
- Cliente paga em real (Pix); comerciante recebe em DePix
- Integração via links e API, não interface de exchange

### Objeções regulatórias
- Comunicar: "Validação CNPJ, práticas antifraude, operação na Liquid Network"
- Evitar: "sem regulamento", "anônimo total"
- FAQ: "Operamos na Liquid Network. Para dúvidas jurídicas, consulte nossa equipe."

---

## 5. Estratégia de conversão

### Oferta inicial
- **Primeiros 30 dias**: Taxa reduzida (ex: 0,3% + R$ 0,99) para novos comerciantes
- **Depósito inicial**: R$ 5,00 já convertido em colateral (comunicação clara)

### Modelo freemium
- **Gratuito**: Cadastro, painel, links e páginas
- **Pago por uso**: Taxa apenas sobre transações efetivas
- **Sem mensalidade** – remove barreira de entrada

### Onboarding
1. Landing → CTA Ativar → Login/Cadastro
2. Redirect para /comercio/ativar
3. Fluxo: Info → Form (CNPJ) → Depósito R$ 5 → Confirmação
4. Pós-ativação: Tour no dashboard (criar primeiro link)

### Programa de indicação B2B
- Comerciante indica outro → 10% da taxa do indicado por 3 meses (em Depix)
- Ou: bônus de limite (ex: +R$ 500 de colateral) ao indicar 1 comerciante aprovado

---

## 6. Integração com landing principal

- O botão **"Tem um comércio?"** no header (Landing, Afiliados) redireciona para `/comercio`
- `/comercio` exibe a **CommerceLanding** (landing B2B)
- Após CTA "Ativar Modo Comércio", usuário vai para `/login` com `redirectAfter: /comercio/ativar`
- Login/cadastro bem-sucedido redireciona para `/comercio/ativar`

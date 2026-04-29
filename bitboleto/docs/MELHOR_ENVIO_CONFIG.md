# Melhor Envio – Configuração e Troubleshooting

## Erro: "invalid_client" / "Client authentication failed"

Este erro ocorre quando o Melhor Envio rejeita a requisição OAuth. As causas mais comuns:

### 1. **Sandbox vs Produção (mais provável)**

Sandbox e produção são ambientes **separados**. O **Client ID** de produção **não funciona** no sandbox e vice-versa.

- **Produção** (padrão): `MELHOR_ENVIO_API_URL=https://api.melhorenvio.com.br`  
  App em https://app.melhorenvio.com.br (Integrações > Área Dev.)

- **Sandbox**: `MELHOR_ENVIO_API_URL=https://sandbox.melhorenvio.com.br`  
  App em https://app-sandbox.melhorenvio.com.br/integracoes/area-dev

**Solução:** Crie um app específico para o ambiente que está usando (sandbox ou produção).

---

### 2. **Redirect URI não coincide**

A `redirect_uri` enviada na URL de autorização deve ser **exatamente igual** à cadastrada no app Melhor Envio.

**URL que apareceu no seu caso:**
```
redirect_uri=https%3A%2F%2Fpagdepix.com%2Fapi%2Fmelhorenvio%2Foauth%2Fcallback
```
Ou seja: `https://pagdepix.com/api/melhorenvio/oauth/callback`

**O que conferir:**
- No painel do Melhor Envio, em “URL de redirecionamento (callback)”, deve estar exatamente:
  - `https://pagdepix.com/api/melhorenvio/oauth/callback`  
  ou
  - `https://api.pagdepix.com/api/melhorenvio/oauth/callback`  
  se a API estiver em domínio diferente.
- Domínio exato: `pagdepix.com` vs `www.pagdepix.com` – devem bater.
- Protocolo: `https` vs `http` – deve ser `https` em produção.

---

### 3. **Client ID incorreto ou inválido**

Confirme que o `MELHOR_ENVIO_CLIENT_ID` no `.env` é o mesmo do app correto (sandbox ou produção).

---

## Checklist de configuração

1. [ ] App criado no ambiente correto (sandbox ou produção).
2. [ ] URL de redirecionamento igual à configurada no app.
3. [ ] Variáveis no `.env` do backend:
   ```env
   MELHOR_ENVIO_API_URL=https://sandbox.melhorenvio.com.br   # ou produção
   MELHOR_ENVIO_CLIENT_ID=seu_client_id
   MELHOR_ENVIO_CLIENT_SECRET=seu_secret
   MELHOR_ENVIO_REDIRECT_URI=https://pagdepix.com/api/melhorenvio/oauth/callback
   ```
4. [ ] Reinício do backend após alterar o `.env`.

---

## Documentação oficial

- [Criando um aplicativo](https://docs.melhorenvio.com.br/docs/criando-um-novo-aplicativo)
- [Sandbox](https://docs.melhorenvio.com.br/docs/sandbox)
- [Autenticação OAuth](https://docs.melhorenvio.com.br/docs/autenticacao-1)

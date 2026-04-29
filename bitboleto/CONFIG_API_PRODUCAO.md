# Conexão Frontend ↔ Backend em produção (Nginx + PM2)

## 1. Rotas do backend (Express)

No `backend/src/server.ts` as rotas são montadas assim:

```ts
app.use('/api', routes);
```

Ou seja, **todas** as rotas têm o prefixo `/api`. No `backend/src/routes/index.ts` o login está definido como:

```ts
router.post('/auth/login', ...);
```

Portanto a URL completa do login é:

- **POST** `/api/auth/login`  
  (e não `/api/login`)

Resumo das URLs da API:

| Ação        | Método | URL completa        |
|------------|--------|---------------------|
| Login      | POST   | `/api/auth/login`   |
| Cadastro   | POST   | `/api/auth/register`|
| Manutenção | GET    | `/api/maintenance/status` |

---

## 2. Teste correto com curl

Use sempre o path **/api/auth/login**:

```bash
curl -X POST https://api.pagdepix.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"playrecargas@pronto.me","password":"sua_senha"}'
```

Se retornar JSON com `token` e `user`, o backend e o Nginx estão ok.

---

## 3. Frontend (baseURL)

No `frontend/src/services/api.ts`:

- `VITE_API_URL=https://api.pagdepix.com` → `baseURL` = `https://api.pagdepix.com/api`
- O frontend chama `api.post('/auth/login', payload)` → request vai para **https://api.pagdepix.com/api/auth/login**

Ou seja, com `.env.production` contendo apenas:

```env
VITE_API_URL=https://api.pagdepix.com
```

a conexão do front com a API está correta. Não precisa de `/api` no final de `VITE_API_URL`; o código já adiciona.

---

## 4. Nginx (proxy reverso para o backend + CORS só no preflight)

**Importante:** CORS deve ser enviado **só em um lugar**. O backend (Express) já envia os headers. Se o Nginx também adicionar `Access-Control-Allow-Origin` em todas as respostas, o navegador vê o header **duplicado** e bloqueia (*"header contains multiple values"*). Por isso: no Nginx **só** trate OPTIONS com CORS; nas demais respostas **não** use `add_header` CORS — deixe o backend enviar.

Exemplo para `api.pagdepix.com`:

```nginx
# Mapa: só permitir origens do site PagDepix (e localhost em dev)
# Coloque este bloco "map" no contexto http (ex.: no topo do mesmo arquivo do server, se ele for incluído dentro de http { })
map $http_origin $cors_origin {
    default "";
    "~^https://(www\.)?pagdepix\.com$" $http_origin;
    "~^http://localhost(:[0-9]+)?$" $http_origin;
}

server {
    listen 443 ssl;
    server_name api.pagdepix.com;

    ssl_certificate     /etc/letsencrypt/live/api.pagdepix.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.pagdepix.com/privkey.pem;

    location / {
        # Preflight OPTIONS: só aqui o Nginx adiciona CORS (evita header duplicado com o backend)
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin $cors_origin;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type, Authorization";
            add_header Access-Control-Allow-Credentials "true";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        # Respostas GET/POST etc.: não adicionar CORS aqui; o backend já envia
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Importante: `proxy_pass http://127.0.0.1:3001;` **sem** path no final. Assim:

- Request: `https://api.pagdepix.com/api/auth/login`
- Nginx envia para: `http://127.0.0.1:3001/api/auth/login`

Se estiver algo como `proxy_pass http://127.0.0.1:3001/api;`, o path fica duplicado/errado. Use só `http://127.0.0.1:3001;`.

O bloco `if ($request_method = OPTIONS)` faz o Nginx responder ao **preflight** com 204 e os headers CORS, sem chamar o Node. As demais requisições (GET, POST, etc.) seguem para o backend e ganham os headers CORS pelo `add_header ... always`.

Depois de editar o site de `api.pagdepix.com`:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Checklist rápido

1. **Backend**
   - PM2 rodando na porta 3001.
   - Teste local: `curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'`

2. **Nginx**
   - `api.pagdepix.com` → `proxy_pass http://127.0.0.1:3001;` (sem `/api` no final).
   - `nginx -t` e `reload`.

3. **Frontend**
   - `frontend/.env.production`: `VITE_API_URL=https://api.pagdepix.com`
   - `npm run build` e publicar `dist/`.

4. **Teste público**
   - `curl -X POST https://api.pagdepix.com/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'`
   - Resposta com `token` e `user` = OK.

5. **CORS**
   - O backend já permite por padrão: `https://www.pagdepix.com`, `https://pagdepix.com`, `http://localhost:5173`, `http://localhost:3000`.
   - **Recomendado:** usar a configuração Nginx da seção 4 acima (map `$cors_origin`, `add_header` com `always` e tratamento de `OPTIONS`). Assim o CORS é aplicado no Nginx e o preflight passa mesmo quando a resposta não vem do Node.
   - Se ainda aparecer "blocked by CORS policy", confira no servidor: `curl -I -X OPTIONS "https://api.pagdepix.com/api/auth/login" -H "Origin: https://www.pagdepix.com" -H "Access-Control-Request-Method: POST"`. Deve retornar 204 e o header `Access-Control-Allow-Origin: https://www.pagdepix.com`. Se retornar 502 ou sem esse header, aplique/revise o bloco Nginx da seção 4 e faça `sudo nginx -t && sudo systemctl reload nginx`.

6. **502 Bad Gateway / "Erro ao processar requisição"**
   - 502 geralmente significa que o Nginx não conseguiu falar com o Node (backend parado ou porta errada). O navegador mostra CORS porque a resposta 502 vem do Nginx, sem cabeçalhos CORS.
   - Verifique: `pm2 list` (processo do backend deve estar "online"), `pm2 logs` para erros, e que o Nginx faz `proxy_pass http://127.0.0.1:3001;` na mesma porta em que o backend escuta (ex: 3001).
   - Reinicie o backend: `cd backend && pm2 restart all` (ou o nome do app). Depois: `sudo nginx -t && sudo systemctl reload nginx`.

7. **API em "errored" no PM2 / crash ao iniciar**
   - Se `pagdepix-api` fica em "errored" e reinicia várias vezes, o Node está caindo ao carregar. Para ver o erro completo, rode na VPS:
     ```bash
     cd /home/pagdepix/bitboleto/backend
     node dist/server.js
     ```
     O terminal mostrará a mensagem de erro (ex.: módulo não encontrado, falha ao criar pasta, variável de ambiente). Corrija o problema, faça `npm run build` se alterou código, e depois `pm2 restart pagdepix-api`.
   - Causas comuns: pasta `backend/uploads/boletos` sem permissão de escrita; `.env` faltando ou `DATABASE_URL` incorreta; `node_modules` desatualizados (rode `npm install` no backend).

Com isso, a conexão do frontend atualizado com o backend no seu setup (Nginx + PM2) fica correta e o login deve funcionar usando a rota **/api/auth/login**.

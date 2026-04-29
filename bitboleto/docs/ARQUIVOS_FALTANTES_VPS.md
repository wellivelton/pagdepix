# Arquivos faltantes na VPS

Copie estes arquivos adicionais do seu projeto local para a VPS.  
Se preferir, use `scp` ou `rsync` da pasta local para a VPS.

---

## Lista de arquivos para copiar

```
backend/src/utils/memoryCache.ts
backend/src/middlewares/rateLimiter.ts
frontend/src/contexts/ToastContext.tsx
frontend/src/pages/comercio/SellerCoupons.tsx
```

---

## Comando rsync (execute na sua máquina LOCAL)

Substitua `usuario@ip-da-vps` pelo seu usuário e IP:

```bash
# Do diretório do projeto (bitboleto/)
rsync -avz backend/src/utils/memoryCache.ts usuario@ip-da-vps:~/bitboleto/backend/src/utils/
rsync -avz backend/src/middlewares/rateLimiter.ts usuario@ip-da-vps:~/bitboleto/backend/src/middlewares/
rsync -avz frontend/src/contexts/ToastContext.tsx usuario@ip-da-vps:~/bitboleto/frontend/src/contexts/
rsync -avz frontend/src/pages/comercio/SellerCoupons.tsx usuario@ip-da-vps:~/bitboleto/frontend/src/pages/comercio/
```

---

## Alternativa: copiar tudo de uma vez

```bash
rsync -avz --exclude node_modules --exclude dist backend/ usuario@ip-da-vps:~/bitboleto/backend/
rsync -avz --exclude node_modules --exclude dist frontend/ usuario@ip-da-vps:~/bitboleto/frontend/
```

---

## Depois de copiar, na VPS:

```bash
cd ~/bitboleto/backend
npm run build
pm2 restart pagdepix-api

cd ~/bitboleto/frontend
npm run build
pm2 restart bitboleto-frontend
```

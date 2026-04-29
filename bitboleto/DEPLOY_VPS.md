# Deploy na VPS – Enviar Pix e correções

## Erros que aparecem na VPS

| Erro | Causa | Solução |
|------|-------|---------|
| `sendPixOrder` / `geradepixWithdrawal` não existe no PrismaClient | Cliente Prisma desatualizado | Rodar `npx prisma generate` |
| Módulo `geradepixService` não encontrado | Arquivo não existe ou não foi enviado | Conferir se `backend/src/services/geradepixService.ts` existe |
| EnviarPix não tem export default | Já corrigido no código | Atualizar o arquivo no repositório |

---

## Ordem dos comandos na VPS (após `git pull` ou deploy)

```bash
# 1. Backend – instalar deps (se necessário) e gerar Prisma
cd /home/pagdepix/bitboleto/backend
npm install
npx prisma generate
npx prisma db push

# 2. Configurar variável de ambiente
# Edite .env e inclua:
# GERADEPIX_API_KEY=sk_live_XrtmiexR11ppHRwljqyH9-W8vc2IKmhK5Rzp9Sx3Rr8

# 3. Build do backend
npm run build

# 4. Frontend (o .npmrc usa legacy-peer-deps para evitar conflito react-helmet-async)
cd /home/pagdepix/bitboleto/frontend
npm install
npm run build

# 5. Reiniciar serviços (ajuste conforme seu ambiente)
pm2 restart backend
pm2 restart frontend
# ou
sudo systemctl restart bitboleto-backend
sudo systemctl restart nginx
```

---

## Arquivos essenciais que devem estar na VPS

- `backend/prisma/schema.prisma` (com modelo `SendPixOrder`)
- `backend/src/services/geradepixService.ts`
- `backend/src/controllers/sendPixController.ts`
- `backend/src/controllers/geradepixWebhookController.ts` (atualizado)
- `frontend/src/pages/EnviarPix.tsx`

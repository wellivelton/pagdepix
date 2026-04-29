# Correção de deploy - Migrations e Build

Se a migração `20260309000000_add_platform_notifications` falhou com "type already exists", execute:

```bash
cd ~/bitboleto/backend

# 1. Marcar a migração falha como "rolled back" para permitir nova tentativa
npx prisma migrate resolve --rolled-back 20260309000000_add_platform_notifications

# 2. Aplicar todas as migrações pendentes (incluindo a corrigida)
npx prisma migrate deploy

# 3. Regenerar o Prisma Client (obrigatório para statusDetail/receiptUrl)
npx prisma generate

# 4. Build e restart
npm run build
pm2 restart pagdepix-api
```

A migração foi ajustada para ser idempotente (não falha se enums/tabelas já existirem).

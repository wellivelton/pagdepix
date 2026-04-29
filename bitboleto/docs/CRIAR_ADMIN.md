# Como criar o usuário ADMIN

Se o banco foi criado vazio, não existe usuário admin. Use o **seed** do Prisma para criar o primeiro admin.

---

## 1. Configurar variáveis no `.env` (backend)

No servidor (VPS), edite o `.env` do backend e adicione (ou ajuste):

```env
# Usuário ADMIN (para o seed)
ADMIN_EMAIL=admin@pagdepix.com
ADMIN_NAME=Administrador
ADMIN_TELEGRAM=@seu_usuario_telegram
ADMIN_PASSWORD=uma_senha_forte_aqui
```

- **ADMIN_EMAIL:** e-mail que você usará para fazer login como admin.
- **ADMIN_NAME:** nome exibido no sistema.
- **ADMIN_TELEGRAM:** seu @ do Telegram (com ou sem @).
- **ADMIN_PASSWORD:** senha de login. **Use uma senha forte** e troque depois nas configurações.

---

## 2. Rodar o seed

Na pasta do backend:

```bash
cd ~/bitboleto/backend
npx prisma db seed
```

Saída esperada:

- Se o admin **não existia:** `Usuário ADMIN criado com sucesso.`
- Se o e-mail **já existia:** `Usuário admin já existe: admin@pagdepix.com` (e, se precisar, o usuário é atualizado para role ADMIN).

---

## 3. Fazer login

1. Acesse **https://pagdepix.com** (ou seu domínio do frontend).
2. Clique em **Login**.
3. Use **ADMIN_EMAIL** e **ADMIN_PASSWORD** configurados no `.env`.
4. O admin não precisa verificar e-mail nem Telegram; o acesso é liberado direto.
5. Depois do primeiro login, vá em **Configurações** e **troque a senha**.

---

## 4. (Opcional) Remover as variáveis do `.env` após criar o admin

Depois de rodar o seed e confirmar o login, você pode **apagar** as linhas `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_TELEGRAM` e `ADMIN_PASSWORD` do `.env` por segurança. O usuário admin já estará criado no banco.

---

## Se o seed der erro

- Confirme que **DATABASE_URL** no `.env` está correto e que o PostgreSQL está rodando.
- Confirme que as **migrações** foram aplicadas: `npx prisma migrate deploy`.
- Se o e-mail do admin já existir como usuário comum, o seed **atualiza** esse usuário para role ADMIN e marca como verificado (email e telegram).

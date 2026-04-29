# Guia de deploy em produção – mudanças de hoje

Este guia descreve **passo a passo** como aplicar no servidor (VPS) todas as alterações feitas hoje, **sem quebrar** o sistema em produção.

---

## O que foi alterado (resumo)

### Backend
- **Regras de taxa**: novas faixas (R$ 20–R$ 49,99 até acima de R$ 500), custo fixo 1% + R$ 0,99, regra 20/20/60 (desconto/comissão/lucro).
- **Limites de boleto**: mínimo R$ 20, máximo padrão R$ 1.000; admin pode liberar valor maior por usuário (`maxBoletoAmount`).
- **Admin**: aba Afiliados, listar/remover afiliação, métricas financeiras (faturado, comissões, descontos, custos, lucro), botão “Liberar valor > R$ 1.000” por usuário.
- **Modo manutenção**: ativar/desativar pelo admin, aviso personalizado; bloqueia cadastro e login (exceto admin); tela de manutenção; persistido no banco.

### Frontend
- **Landing**: botão “Seja Afiliado”, tabela de taxas e limites atualizados.
- **Páginas novas**: Regras (`/regras`), Afiliados (`/afiliados`), Manutenção (`/manutencao`).
- **Checkout (PayBoleto)**: validação valor min/max e data de vencimento.
- **Dashboard**: item “Regras” na sidebar.
- **Admin**: aba Afiliados, métricas, liberação de valor por usuário, botão e modal de modo manutenção.
- **Afiliado**: saldo e saques em DEPIX, histórico de indicações.
- **Login**: aviso de manutenção quando ativo; redirecionamento para `/manutencao` em 503.

### Banco de dados (migrations)
1. **max_boleto_amount**: coluna `User.maxBoletoAmount` (Float, opcional).
2. **maintenance_mode**: colunas em `Config`: `maintenanceMode`, `maintenanceMessage`, `maintenanceUpdatedAt`, `maintenanceUpdatedBy`.

---

## Pré-requisitos

- Acesso SSH à VPS.
- Projeto já rodando em produção (backend + frontend).
- Saber como o backend e o frontend são iniciados (PM2, systemd, Docker, etc.).

---

## Passo 1: Backup (obrigatório)

Faça **antes** de qualquer alteração.

### 1.1 Backup do banco (PostgreSQL)

```bash
# Conecte na VPS e rode (ajuste DATABASE_URL ou use variáveis do seu .env)
pg_dump "$DATABASE_URL" -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
# Ou, se usar variáveis separadas:
# pg_dump -h SEU_HOST -U SEU_USER -d SEU_BANCO -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
```

Guarde o arquivo `.dump` em um lugar seguro (fora da VPS também, se possível).

### 1.2 Backup do código atual na VPS

```bash
cd /caminho/do/projeto  # ex: /var/www/bitboleto ou ~/bitboleto
tar -czvf ../bitboleto_backup_$(date +%Y%m%d_%H%M%S).tar.gz .
```

Assim você pode restaurar a pasta do projeto em caso de rollback.

---

## Passo 2: Enviar o código novo para a VPS

Escolha **uma** das formas abaixo.

### Opção A: Git (recomendado)

No seu **computador local** (onde está o projeto atualizado):

```bash
cd /home/wellivelton/Área\ de\ trabalho/Projetos\ VS\ Code/bitboleto
git add -A
git commit -m "Regras de taxa, limites, admin afiliados/métricas, modo manutenção"
git push origin main   # ou master, conforme seu remoto
```

Na **VPS**:

```bash
cd /caminho/do/projeto
git fetch origin
git status   # só para conferir
git pull origin main   # ou master
```

### Opção B: Upload manual (RSYNC / SCP)

No seu computador:

```bash
rsync -avz --exclude node_modules --exclude .env --exclude backend/uploads \
  "/home/wellivelton/Área de trabalho/Projetos VS Code/bitboleto/" \
  usuario@IP_DA_VPS:/caminho/do/projeto/
```

Não sobrescreva o `.env` da VPS; ele deve continuar com as configs de produção.

---

## Passo 3: Backend na VPS

Tudo a seguir na **VPS**, na pasta do projeto.

### 3.1 Entrar na pasta do backend

```bash
cd /caminho/do/projeto/backend
```

### 3.2 Instalar dependências (se houver pacote novo)

```bash
npm install
```

Hoje não foi adicionado pacote novo; é só garantir que está igual ao `package.json`.

### 3.3 Rodar as migrations (banco)

Isso cria/atualiza as colunas **sem apagar dados**:

```bash
npx prisma migrate deploy
```

Se aparecer erro de conexão, confira `DATABASE_URL` no `.env` do backend.

Você deve ver algo como:

- `Applying migration `20260129180000_add_max_boleto_amount`
- `Applying migration `20260129200000_add_maintenance_mode`

### 3.4 Gerar o Prisma Client (caso precise)

```bash
npx prisma generate
```

### 3.5 Reiniciar o backend

Exemplos conforme como você sobe o servidor:

**Se usar PM2:**

```bash
pm2 restart backend   # ou o nome do processo que você deu
# ou
pm2 restart all
pm2 save
```

**Se usar systemd:**

```bash
sudo systemctl restart bitboleto-backend   # nome do seu serviço
```

**Se usar `npm run dev` em produção (não ideal):** pare o processo (Ctrl+C) e suba de novo.

### 3.6 Conferir se o backend subiu

```bash
curl -s http://localhost:3001/api/maintenance/status
# ou a porta que você usa
```

Resposta esperada: `{"active":false,"message":null}` (ou `true` se já tiver ativado manutenção).

---

## Passo 4: Frontend na VPS

### 4.1 Entrar na pasta do frontend

```bash
cd /caminho/do/projeto/frontend
```

### 4.2 Instalar dependências

```bash
npm install
```

### 4.3 Variável de ambiente da API

Confira se no build de produção a API aponta para o backend correto, por exemplo:

```bash
# .env.production ou no comando de build
VITE_API_URL=https://sua-api.com/api
# ou
VITE_API_URL=https://api.seudominio.com/api
```

Use a **mesma** URL que a aplicação em produção já usa hoje.

### 4.4 Build de produção

```bash
npm run build
```

Se der erro, leia a mensagem (geralmente é import ou variável de ambiente).

### 4.5 Publicar os arquivos gerados

O build gera a pasta `dist/` (ou `build/`). O que você faz com ela depende de como o frontend está servido:

**Nginx (pasta estática):**

```bash
# Exemplo: copiar conteúdo de dist para a pasta que o Nginx usa
sudo cp -r dist/* /var/www/html/pagdepix/
# ou
sudo rsync -av dist/ /var/www/html/pagdepix/
```

**Node (serve estático):**

Se um processo Node serve a pasta estática, aponte ele para a nova `dist/` e reinicie esse processo (PM2/systemd).

Depois disso, o frontend em produção estará com as novas telas (Regras, Afiliados, Manutenção, Admin com afiliados/métricas/manutenção, etc.).

---

## Passo 5: Verificações pós-deploy

Faça na ordem, com calma.

1. **Health da API**
   - `GET https://sua-api.com/api/maintenance/status` → `{ "active": false, "message": null }`.

2. **Login**
   - Login com um usuário comum e com um admin; ambos devem conseguir entrar (com manutenção desativada).

3. **Landing**
   - Abrir a landing; conferir botão “Seja Afiliado” e tabela de taxas/limites.

4. **Checkout**
   - Tentar valor &lt; R$ 20 e &gt; R$ 1.000; deve bloquear e mostrar avisos. Data vencida deve bloquear.

5. **Dashboard**
   - Sidebar com “Regras”; abrir `/regras` e `/afiliados` (pública).

6. **Admin**
   - Login como admin; conferir:
     - Aba “Afiliados”, lista e “Remover afiliação”.
     - Métricas (faturado, comissões, descontos, custos, lucro).
     - Em Usuários: “Máx. Boleto” e botão “Liberar valor > R$ 1.000”.
     - Botão “Ativar modo manutenção”; abrir modal, colocar um aviso, confirmar.

7. **Modo manutenção**
   - Com manutenção **ativa**:
     - Abrir login em aba anônima: deve aparecer aviso de manutenção e não deixar logar (exceto admin).
     - Acessar uma rota protegida (ex.: `/dashboard`) sem ser admin: deve ir para `/manutencao` ou ver a tela de manutenção.
   - Desativar modo manutenção no admin e repetir: login e dashboard devem voltar ao normal.

8. **Afiliado**
   - Login como afiliado; saldo e valores em DEPIX; histórico de indicações; solicitar saque (mín. 20 DEPIX) e modal com endereço Liquid.

Se algo falhar, use o Passo 6 (rollback).

---

## Passo 6: Rollback (se algo quebrar)

### 6.1 Reverter código (Git)

Na VPS:

```bash
cd /caminho/do/projeto
git log --oneline -5   # achar o commit anterior ao deploy
git reset --hard COMMIT_ANTERIOR
git push --force origin main   # só se tiver certeza; senão não dê push
```

### 6.2 Reinstalar dependências e reiniciar

```bash
cd backend && npm install && npx prisma generate
# Reinicie o backend (PM2/systemd)
cd ../frontend && npm install && npm run build
# Republique a pasta dist/ como antes
```

### 6.3 Banco de dados

As migrations de hoje **só adicionam colunas** (e valores padrão). Não removem dados. Em princípio **não é necessário** reverter o banco.

Se por algum motivo precisar remover as colunas novas (não recomendado):

- Remover manualmente as colunas `User.maxBoletoAmount` e as de manutenção da tabela `config` **só** se tiver certeza e tiver feito backup.

O **backup do Passo 1** serve para restaurar o banco inteiro em caso de desastre; para rollback “só código”, normalmente basta voltar o código e reiniciar.

---

## Checklist rápido

- [ ] Backup do banco (pg_dump)
- [ ] Backup do código na VPS (tar)
- [ ] Código novo na VPS (git pull ou rsync)
- [ ] Backend: `npm install`, `npx prisma migrate deploy`, `npx prisma generate`, reiniciar
- [ ] Frontend: `npm install`, conferir `VITE_API_URL`, `npm run build`, publicar `dist/`
- [ ] Testes: maintenance/status, login, landing, checkout, admin (afiliados, métricas, liberação valor, modo manutenção), afiliado (DEPIX, histórico)
- [ ] Se algo quebrar: rollback do código e reinício (e só em último caso mexer no banco)

Seguindo essa ordem e com o backup feito, a implementação das novas funcionalidades pode ser feita com calma e com risco baixo de quebrar o que já está rodando em produção.

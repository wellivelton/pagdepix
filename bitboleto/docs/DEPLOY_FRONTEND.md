# Deploy do frontend em produção (trocar sem quebrar)

## 1. Na sua máquina local

### 1.1 Definir a URL da API de produção

Antes do build, o frontend precisa saber a URL da API em produção. Crie ou edite um arquivo `.env.production` na pasta **frontend**:

```bash
cd frontend
```

Crie o arquivo `.env.production` com o conteúdo (troque pela URL real da sua API):

```
VITE_API_URL=https://sua-api.com
```

Exemplo: se a API está em `https://api.pagdepix.com`, use:

```
VITE_API_URL=https://api.pagdepix.com
```

(O Vite usa essa variável só no build; não precisa do `/api` no final se sua API está em `https://api.pagdepix.com/api` – o código já adiciona `/api`.)

### 1.2 Build

```bash
npm run build
```

Isso gera a pasta **`frontend/dist`** com os arquivos estáticos (HTML, JS, CSS, imagens).

### 1.3 Conferir

Abra `frontend/dist/index.html` e veja se está tudo certo. A pasta `dist` é a que você vai enviar para o servidor.

---

## 2. Na VPS (servidor de produção)

### 2.1 Onde está o frontend hoje?

No servidor, o frontend em produção costuma estar em uma pasta como:

- `/var/www/pagdepix` ou
- `/home/usuario/pagdepix/frontend/dist` ou
- outro caminho que o Nginx (ou outro servidor web) aponta.

Descubra qual é. Exemplo com Nginx:

```bash
sudo grep -r "root " /etc/nginx/sites-enabled/
```

O valor de `root` é a pasta que está servindo o frontend.

### 2.2 Fazer backup da versão atual

Antes de trocar qualquer coisa, faça backup da pasta atual:

```bash
# Troque CAMINHO_DO_FRONTEND pelo caminho real (ex: /var/www/pagdepix)
export FRONTEND_DIR="/var/www/pagdepix"
sudo cp -r $FRONTEND_DIR ${FRONTEND_DIR}.backup.$(date +%Y%m%d_%H%M%S)
```

Assim, se der problema, você restaura com:

```bash
sudo rm -rf $FRONTEND_DIR
sudo mv ${FRONTEND_DIR}.backup.TIMESTAMP $FRONTEND_DIR
```

### 2.3 Enviar o novo frontend da sua máquina para a VPS

**Opção A – rsync (recomendado)**

Na sua **máquina local**, na pasta do projeto:

```bash
# Troque usuario e IP pelo seu usuário e IP da VPS
# Troque /var/www/pagdepix pelo caminho real do frontend na VPS
rsync -avz --delete frontend/dist/ usuario@IP_DA_VPS:/var/www/pagdepix/
```

`--delete` remove na VPS arquivos que não existem mais no novo build.

**Opção B – SCP**

```bash
# Na sua máquina: compactar e enviar
cd frontend && tar czvf ../dist.tar.gz dist/
scp ../dist.tar.gz usuario@IP_DA_VPS:/tmp/

# Na VPS: descompactar e substituir
ssh usuario@IP_DA_VPS
sudo mkdir -p /var/www/pagdepix.new
sudo tar xzvf /tmp/dist.tar.gz -C /var/www/pagdepix.new --strip-components=1
sudo rm -rf /var/www/pagdepix.old
sudo mv /var/www/pagdepix /var/www/pagdepix.old
sudo mv /var/www/pagdepix.new /var/www/pagdepix
```

**Opção C – Git (se o código está em um repositório)**

Na VPS:

```bash
cd /caminho/do/projeto
git pull
cd frontend
# Crie .env.production na VPS com VITE_API_URL da API de produção
npm ci
npm run build
sudo cp -r dist/* /var/www/pagdepix/
```

### 2.4 Recarregar o servidor web (se necessário)

Se usar Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Testar

1. Abra o site no navegador (modo anônimo ou outro navegador).
2. Confira: login, cadastro, abas principais, favicon e logo.
3. Se algo quebrou: use o backup (passo 2.2) e reverta a pasta do frontend.

---

## Resumo rápido

| Onde      | O que fazer |
|-----------|--------------|
| Local     | Criar `frontend/.env.production` com `VITE_API_URL=https://sua-api.com` |
| Local     | `cd frontend && npm run build` |
| VPS       | Backup da pasta atual do frontend |
| Local→VPS | Enviar `frontend/dist/*` para a pasta que o Nginx (ou outro) usa |
| VPS       | `sudo systemctl reload nginx` (se usar Nginx) |
| Navegador | Testar o site |

Assim você troca o frontend em produção sem quebrar nada e com rollback fácil.

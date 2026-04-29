#!/bin/bash
echo "🚀 Iniciando Deploy..."

echo "📦 Atualizando Frontend..."
cd ~/bitboleto/frontend && VITE_API_URL=https://api.pagdepix.com npm run build
pm2 restart bitboleto-frontend

echo "⚙️ Atualizando Backend..."
cd ~/bitboleto/backend && npm run build
pm2 restart pagdepix-api

echo "✅ Tudo pronto! Site atualizado."

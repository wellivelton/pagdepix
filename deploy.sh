#!/bin/bash

echo "🚀 Iniciando ambiente de desenvolvimento..."

echo "⚙️ Backend..."
cd ~/bitboleto/backend && npm run dev &

echo "📦 Frontend..."
cd ~/bitboleto/frontend && npm run dev &

echo "✅ Tudo rodando em modo dev!"

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { prisma } from './prisma';
import authRoutes from './routes/authRoutes';
import webhookRoutes from './routes/webhookRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import transactionRoutes from './routes/transactionRoutes';
import auditRoutes from './routes/auditRoutes';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// ============================================================
// CORS
// ============================================================
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origem não permitida: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ============================================================
// BODY PARSER
// Importante: o webhook precisa do rawBody para validar HMAC.
// Por isso usamos verify para preservar o buffer original.
// ============================================================
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
    limit: '1mb',
  })
);

app.use(express.urlencoded({ extended: true }));

// ============================================================
// FRONTEND ESTÁTICO (painel de contabilidade)
// Serve index.html e assets da pasta public/
// ============================================================
app.use(express.static(path.join(process.cwd(), 'public')));

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DepixCore',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// ROTAS
// ============================================================
app.use('/auth', authRoutes);
app.use('/depixcore/webhook', webhookRoutes);
app.use('/depixcore/dashboard', dashboardRoutes);
app.use('/depixcore/transactions', transactionRoutes);
app.use('/depixcore/audit', auditRoutes);

// ============================================================
// ROTA NÃO ENCONTRADA
// ============================================================
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ============================================================
// ERRO GLOBAL
// ============================================================
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[DepixCore] Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('[DepixCore] ✅ Banco de dados conectado');

    app.listen(PORT, () => {
      console.log(`[DepixCore] 🚀 Servidor rodando na porta ${PORT}`);
      console.log(`[DepixCore] 📡 Webhook endpoint: POST http://localhost:${PORT}/depixcore/webhook`);
      console.log(`[DepixCore] 📊 Dashboard:        GET  http://localhost:${PORT}/depixcore/dashboard/summary`);
    });
  } catch (error) {
    console.error('[DepixCore] ❌ Erro ao inicializar:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[DepixCore] SIGTERM recebido. Encerrando...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[DepixCore] SIGINT recebido. Encerrando...');
  await prisma.$disconnect();
  process.exit(0);
});

bootstrap();

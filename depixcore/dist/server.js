"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./prisma");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const transactionRoutes_1 = __importDefault(require("./routes/transactionRoutes"));
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3002', 10);
// ============================================================
// CORS
// ============================================================
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            cb(null, true);
        }
        else {
            cb(new Error(`CORS: origem não permitida: ${origin}`));
        }
    },
    credentials: true,
}));
// ============================================================
// BODY PARSER
// Importante: o webhook precisa do rawBody para validar HMAC.
// Por isso usamos verify para preservar o buffer original.
// ============================================================
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
    limit: '1mb',
}));
app.use(express_1.default.urlencoded({ extended: true }));
// ============================================================
// FRONTEND ESTÁTICO (painel de contabilidade)
// Serve index.html e assets da pasta public/
// ============================================================
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
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
app.use('/auth', authRoutes_1.default);
app.use('/depixcore/webhook', webhookRoutes_1.default);
app.use('/depixcore/dashboard', dashboardRoutes_1.default);
app.use('/depixcore/transactions', transactionRoutes_1.default);
app.use('/depixcore/audit', auditRoutes_1.default);
// ============================================================
// ROTA NÃO ENCONTRADA
// ============================================================
app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});
// ============================================================
// ERRO GLOBAL
// ============================================================
app.use((err, _req, res, _next) => {
    console.error('[DepixCore] Erro não tratado:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});
// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function bootstrap() {
    try {
        await prisma_1.prisma.$connect();
        console.log('[DepixCore] ✅ Banco de dados conectado');
        app.listen(PORT, () => {
            console.log(`[DepixCore] 🚀 Servidor rodando na porta ${PORT}`);
            console.log(`[DepixCore] 📡 Webhook endpoint: POST http://localhost:${PORT}/depixcore/webhook`);
            console.log(`[DepixCore] 📊 Dashboard:        GET  http://localhost:${PORT}/depixcore/dashboard/summary`);
        });
    }
    catch (error) {
        console.error('[DepixCore] ❌ Erro ao inicializar:', error);
        process.exit(1);
    }
}
process.on('SIGTERM', async () => {
    console.log('[DepixCore] SIGTERM recebido. Encerrando...');
    await prisma_1.prisma.$disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('[DepixCore] SIGINT recebido. Encerrando...');
    await prisma_1.prisma.$disconnect();
    process.exit(0);
});
bootstrap();
//# sourceMappingURL=server.js.map
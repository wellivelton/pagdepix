// Primeira linha: carregar .env antes de qualquer import (swapverse/routes leem process.env ao carregar)
require('./loadEnv');
// Segunda: validar todas as env vars críticas — crasha aqui se alguma estiver faltando ou inválida
require('./config/env');

const express = require('express');
const cors = require('cors');
import helmet from 'helmet';
import routes from './routes/index';
import apiV1Routes from './routes/apiV1Routes';
import { generalRateLimiter } from './middlewares/rateLimiter';
import { initEmailService } from './services/email.service';
import { initPushService } from './services/push.service';
import { startCommercePaymentsSync } from './jobs/syncCommercePayments';
import { startMarketplacePaymentsSync } from './jobs/syncMarketplacePayments';
import { startReleaseSellerBalances } from './jobs/releaseSellerBalances';
import { startReleaseExpiredReservations } from './jobs/releaseExpiredMarketOrderReservations';
import { startSyncSendPixOrders } from './jobs/syncSendPixOrders';
import { startWebhookRetryWorker } from './services/webhookService';
import { startSyncLiquidPayments } from './jobs/syncLiquidPayments';
import { resetApiEndUserDailyLimits, resetApiEndUserMonthlyLimits } from './jobs/resetApiEndUserLimits';
import { startRetrySideswapBroadcast } from './jobs/retrySideswapBroadcast';
import { startSyncToprecargasProducts } from './jobs/syncToprecargasProducts';

// Logar erros não capturados para diagnóstico
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] unhandledRejection:', reason, promise);
});

initEmailService();
initPushService();

const app = express();

// Trust proxy para obter IP real em produção
app.set('trust proxy', 1);

// CORS: origens permitidas. Adicione CORS_ORIGINS no .env se necessário (ex: https://app.seudominio.com)
const defaultOrigins = ['https://www.pagdepix.com', 'https://pagdepix.com', 'http://localhost:5173', 'http://localhost:3000'];
const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean)
  : [];
const corsOrigins = defaultOrigins.concat(envOrigins).filter((o, i, arr) => arr.indexOf(o) === i);
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-API-Secret'],
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(helmet({
  contentSecurityPolicy: false,      // CSP desativado — React frontend requer config separada
  crossOriginEmbedderPolicy: false,  // necessário para recursos externos (PDFs, imagens)
}));

app.use(express.json({
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  },
}));

// Rate limiting geral aplicado a todas as rotas
app.use('/api', generalRateLimiter);

// Arquivos estáticos (PDFs e comprovantes)
app.use('/uploads', express.static(require('path').resolve(__dirname, '..', 'uploads')));

app.use('/api/v1', apiV1Routes);
app.use('/api', routes);

// Sitemap dinâmico (acessível sem /api)
app.get('/sitemap.xml', async (_req: any, res: any) => {
  try {
    const { prisma } = require('./prisma');
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://pagdepix.com';

    const [products, sellers, categories] = await Promise.all([
      prisma.product.findMany({
        where: { status: 'APPROVED' },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }),
      prisma.user.findMany({
        where: { sellerProducts: { some: { status: 'APPROVED' } } },
        select: { id: true, updatedAt: true },
        take: 1000,
      }),
      prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
    ]);

    const staticRoutes = [
      { loc: `${FRONTEND_URL}/loja`, priority: '1.0', changefreq: 'daily' },
      { loc: `${FRONTEND_URL}/loja/carrinho`, priority: '0.3', changefreq: 'never' },
    ];

    const productRoutes = products.map((p: { slug: string; updatedAt: Date }) => ({
      loc: `${FRONTEND_URL}/loja/produto/${p.slug}`,
      lastmod: p.updatedAt.toISOString().slice(0, 10),
      priority: '0.8',
      changefreq: 'weekly',
    }));

    const sellerRoutes = sellers.map((s: { id: string; updatedAt: Date }) => ({
      loc: `${FRONTEND_URL}/loja/vendedor/${s.id}`,
      lastmod: s.updatedAt.toISOString().slice(0, 10),
      priority: '0.6',
      changefreq: 'weekly',
    }));

    const categoryRoutes = categories.map((c: { slug: string; updatedAt: Date }) => ({
      loc: `${FRONTEND_URL}/loja?categorySlug=${c.slug}`,
      lastmod: c.updatedAt.toISOString().slice(0, 10),
      priority: '0.5',
      changefreq: 'weekly',
    }));

    const allUrls = [...staticRoutes, ...productRoutes, ...sellerRoutes, ...categoryRoutes];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[Sitemap] Erro:', err);
    res.status(500).send('Erro ao gerar sitemap');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor na porta ${PORT}`);
  startCommercePaymentsSync();
  startMarketplacePaymentsSync();
  startReleaseSellerBalances();
  startReleaseExpiredReservations();
  startSyncSendPixOrders();
  startWebhookRetryWorker();
  startSyncLiquidPayments();
  startRetrySideswapBroadcast();
  startSyncToprecargasProducts();

  // Reset diário de limites por usuário final (às 00:05, via verificação horária)
  const scheduleResets = () => {
    const now = new Date();
    // Reset diário: roda entre 00:00 e 00:59
    if (now.getHours() === 0) {
      resetApiEndUserDailyLimits().catch(e => console.error('[resetApiEndUserLimits]', e));
      // Reset mensal: roda no dia 1
      if (now.getDate() === 1) {
        resetApiEndUserMonthlyLimits().catch(e => console.error('[resetApiEndUserMonthlyLimits]', e));
      }
    }
  };
  // Verificar uma vez por hora
  setInterval(scheduleResets, 60 * 60 * 1000);
});

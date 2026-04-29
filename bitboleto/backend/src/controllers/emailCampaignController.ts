import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { sendCampaignEmail } from '../services/email.service';

const API_URL = process.env.API_URL || 'https://api.pagdepix.com/api';
const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.pagdepix.com';

// 1×1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function substituteVars(
  html: string,
  user: { name: string | null; email: string; balance?: number },
): string {
  return html
    .replace(/\{\{nome\}\}/gi, user.name || 'Cliente')
    .replace(/\{\{email\}\}/gi, user.email)
    .replace(/\{\{saldo\}\}/gi,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(user.balance ?? 0),
    );
}

function injectTracking(html: string, trackToken: string, unsubToken: string): string {
  const pixel = `<img src="${API_URL}/email/track/open/${trackToken}" width="1" height="1" style="display:none" alt="" />`;
  const unsub = `
    <div style="text-align:center;padding:16px 0;border-top:1px solid #333;margin-top:32px">
      <p style="color:#666;font-size:11px;margin:0">
        Você recebeu este email porque é usuário do PagDepix.<br>
        <a href="${FRONTEND_URL}/email/unsubscribe/${unsubToken}" style="color:#888">Cancelar inscrição</a>
      </p>
    </div>`;

  return html.replace(/<\/body>/i, `${pixel}${unsub}</body>`) + (/<\/body>/i.test(html) ? '' : pixel + unsub);
}

async function buildAudience(campaign: {
  targetType: string;
  targetRoles: string[];
  targetUserIds: string[];
  targetSegment?: string | null;
}): Promise<Array<{ id: string; name: string | null; email: string; emailVerified: boolean }>> {
  const where: any = { emailVerified: true };

  if (campaign.targetType === 'ROLES' && campaign.targetRoles.length > 0) {
    where.role = { in: campaign.targetRoles };
  } else if (campaign.targetType === 'USERS' && campaign.targetUserIds.length > 0) {
    where.id = { in: campaign.targetUserIds };
  } else if (campaign.targetType === 'SEGMENT') {
    const now = new Date();
    switch (campaign.targetSegment) {
      case 'active_30d':
        where.updatedAt = { gte: new Date(now.getTime() - 30 * 86400000) };
        break;
      case 'inactive_30d':
        where.updatedAt = { lt: new Date(now.getTime() - 30 * 86400000) };
        break;
      case 'commerce':
        where.role = 'COMMERCE';
        break;
      case 'affiliate':
        where.role = 'AFFILIATE';
        break;
    }
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, emailVerified: true },
  });

  // Filter out unsubscribed emails
  const unsubEmails = await prisma.emailUnsubscribe.findMany({
    where: { email: { in: users.map(u => u.email) } },
    select: { email: true },
  });
  const unsubSet = new Set(unsubEmails.map(u => u.email));

  return users.filter(u => !unsubSet.has(u.email));
}

/* ─── Campaign CRUD ────────────────────────────────────────────────────────── */

export const listCampaigns = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const skip = (page - 1) * limit;
    const status = String(req.query.status || '');

    const where: any = {};
    if (status) where.status = status as any;

    const [campaigns, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, name: true, subject: true, status: true, targetType: true,
          totalRecipients: true, totalSent: true, totalFailed: true, totalOpened: true,
          sentAt: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.emailCampaign.count({ where }),
    ]);

    return res.json({ campaigns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e: any) {
    console.error('listCampaigns:', e.message);
    return res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
};

export const getCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: p(req.params.id) } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    return res.json({ campaign });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao buscar campanha' });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId as string;
    const { name, subject, htmlBody, textBody, fromName, targetType, targetRoles, targetUserIds, targetSegment } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!subject?.trim()) return res.status(400).json({ error: 'Assunto é obrigatório' });
    if (!htmlBody?.trim()) return res.status(400).json({ error: 'Conteúdo HTML é obrigatório' });

    const campaign = await prisma.emailCampaign.create({
      data: {
        name: name.trim(),
        subject: subject.trim(),
        htmlBody,
        textBody: textBody || null,
        fromName: fromName?.trim() || 'PagDepix',
        targetType: targetType || 'ALL',
        targetRoles: targetRoles || [],
        targetUserIds: targetUserIds || [],
        targetSegment: targetSegment || null,
        createdBy: adminId,
      },
    });

    return res.status(201).json({ campaign });
  } catch (e: any) {
    console.error('createCampaign:', e.message);
    return res.status(500).json({ error: 'Erro ao criar campanha' });
  }
};

export const updateCampaign = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.emailCampaign.findUnique({ where: { id: p(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (existing.status !== 'DRAFT') return res.status(400).json({ error: 'Apenas rascunhos podem ser editados' });

    const { name, subject, htmlBody, textBody, fromName, targetType, targetRoles, targetUserIds, targetSegment } = req.body;

    const campaign = await prisma.emailCampaign.update({
      where: { id: p(req.params.id) },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(subject !== undefined && { subject: subject.trim() }),
        ...(htmlBody !== undefined && { htmlBody }),
        ...(textBody !== undefined && { textBody }),
        ...(fromName !== undefined && { fromName: fromName.trim() || 'PagDepix' }),
        ...(targetType !== undefined && { targetType }),
        ...(targetRoles !== undefined && { targetRoles }),
        ...(targetUserIds !== undefined && { targetUserIds }),
        ...(targetSegment !== undefined && { targetSegment }),
      },
    });

    return res.json({ campaign });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao atualizar campanha' });
  }
};

export const deleteCampaign = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.emailCampaign.findUnique({ where: { id: p(req.params.id) } });
    if (!existing) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (existing.status === 'SENDING') return res.status(400).json({ error: 'Não é possível deletar uma campanha em envio' });

    await prisma.emailCampaign.delete({ where: { id: p(req.params.id) } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao deletar campanha' });
  }
};

/* ─── Audience Preview ─────────────────────────────────────────────────────── */

export const previewAudience = async (req: Request, res: Response) => {
  try {
    const { targetType = 'ALL', targetRoles = [], targetUserIds = [], targetSegment } = req.body;
    const audience = await buildAudience({ targetType, targetRoles, targetUserIds, targetSegment });
    const sample = audience.slice(0, 5).map(u => ({ name: u.name, email: u.email }));
    return res.json({ count: audience.length, sample });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao calcular audiência' });
  }
};

/* ─── Test Send ────────────────────────────────────────────────────────────── */

export const sendTestEmail = async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: p(req.params.id) } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const { testEmail } = req.body;
    if (!testEmail?.trim()) return res.status(400).json({ error: 'Email de teste obrigatório' });

    const fakeUser = { name: 'Admin Teste', email: testEmail.trim(), balance: 0 };
    const personalizedHtml = substituteVars(campaign.htmlBody, fakeUser);
    const finalHtml = injectTracking(personalizedHtml, 'test-token', 'test-unsub');

    const sent = await sendCampaignEmail(testEmail.trim(), `[TESTE] ${campaign.subject}`, finalHtml, campaign.fromName);
    if (!sent) return res.status(500).json({ error: 'Falha ao enviar email de teste' });

    return res.json({ ok: true, message: `Email de teste enviado para ${testEmail}` });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao enviar teste' });
  }
};

/* ─── Launch Campaign ──────────────────────────────────────────────────────── */

export const launchCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: p(req.params.id) } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (campaign.status !== 'DRAFT') return res.status(400).json({ error: 'Apenas rascunhos podem ser enviados' });

    // Build audience
    const audience = await buildAudience(campaign as any);
    if (audience.length === 0) return res.status(400).json({ error: 'Nenhum destinatário encontrado para este segmento' });

    // Mark as SENDING
    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SENDING', totalRecipients: audience.length },
    });

    // Respond immediately — send asynchronously
    res.json({ ok: true, totalRecipients: audience.length, message: 'Campanha em andamento. Os emails estão sendo enviados.' });

    // Async processing
    (async () => {
      let totalSent = 0;
      let totalFailed = 0;

      // Create logs in bulk
      await prisma.emailCampaignLog.createMany({
        data: audience.map(u => ({
          campaignId: campaign.id,
          userId: u.id,
          email: u.email,
          status: 'pending',
        })),
        skipDuplicates: true,
      });

      // Fetch created logs
      const logs = await prisma.emailCampaignLog.findMany({
        where: { campaignId: campaign.id, status: 'pending' },
      });

      // Send in batches of 10
      const BATCH = 10;
      for (let i = 0; i < logs.length; i += BATCH) {
        const batch = logs.slice(i, i + BATCH);
        await Promise.all(batch.map(async (log) => {
          const user = audience.find(u => u.email === log.email);
          const personalizedHtml = substituteVars(campaign.htmlBody, {
            name: user?.name || null,
            email: log.email,
          });
          const finalHtml = injectTracking(personalizedHtml, log.trackToken, log.trackToken);
          const sent = await sendCampaignEmail(log.email, campaign.subject, finalHtml, campaign.fromName);

          if (sent) {
            totalSent++;
            await prisma.emailCampaignLog.update({
              where: { id: log.id },
              data: { status: 'sent', sentAt: new Date() },
            });
          } else {
            totalFailed++;
            await prisma.emailCampaignLog.update({
              where: { id: log.id },
              data: { status: 'failed', failReason: 'Resend error' },
            });
          }
        }));

        // Brief pause between batches to respect rate limits
        if (i + BATCH < logs.length) await new Promise(r => setTimeout(r, 200));
      }

      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: {
          status: totalFailed === logs.length ? 'FAILED' : 'SENT',
          sentAt: new Date(),
          totalSent,
          totalFailed,
        },
      });

      console.log(`[EmailCampaign] "${campaign.name}" finalizada — enviados: ${totalSent}, falhas: ${totalFailed}`);
    })().catch(e => {
      console.error('[EmailCampaign] Erro no envio assíncrono:', e.message);
      prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'FAILED' } }).catch(() => {});
    });
  } catch (e: any) {
    console.error('launchCampaign:', e.message);
    return res.status(500).json({ error: 'Erro ao iniciar campanha' });
  }
};

/* ─── Metrics ──────────────────────────────────────────────────────────────── */

export const getCampaignMetrics = async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: p(req.params.id) },
      select: {
        id: true, name: true, subject: true, status: true,
        totalRecipients: true, totalSent: true, totalFailed: true, totalOpened: true,
        sentAt: true, createdAt: true,
      },
    });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const openRate = campaign.totalSent > 0
      ? ((campaign.totalOpened / campaign.totalSent) * 100).toFixed(1)
      : '0.0';
    const deliveryRate = campaign.totalRecipients > 0
      ? ((campaign.totalSent / campaign.totalRecipients) * 100).toFixed(1)
      : '0.0';

    return res.json({
      campaign,
      metrics: { openRate: parseFloat(openRate), deliveryRate: parseFloat(deliveryRate) },
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
};

/* ─── Open Tracking (public) ───────────────────────────────────────────────── */

export const trackOpen = async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.end(TRACKING_PIXEL);

  const trackToken = p(req.params.trackToken);
  if (!trackToken || trackToken === 'test-token') return;

  try {
    const log = await prisma.emailCampaignLog.findUnique({ where: { trackToken } });
    if (!log || log.openedAt) return;

    await prisma.emailCampaignLog.update({
      where: { trackToken },
      data: { status: 'opened', openedAt: new Date() },
    });
    await prisma.emailCampaign.update({
      where: { id: log.campaignId },
      data: { totalOpened: { increment: 1 } },
    });
  } catch { /* silent */ }
};

/* ─── Unsubscribe (public) ─────────────────────────────────────────────────── */

export const handleUnsubscribe = async (req: Request, res: Response) => {
  const token = p(req.params.token);
  try {
    const log = await prisma.emailCampaignLog.findUnique({
      where: { trackToken: token },
      select: { email: true, userId: true },
    });

    if (!log) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:80px;background:#111;color:#fff">
          <h2>Link inválido</h2><p style="color:#888">Token não encontrado.</p>
        </body></html>`);
    }

    await prisma.emailUnsubscribe.upsert({
      where: { email: log.email },
      update: {},
      create: { email: log.email, userId: log.userId || null },
    });

    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:80px;background:#111;color:#fff">
        <h2 style="color:#f97316">Descadastrado com sucesso</h2>
        <p style="color:#888">O email <strong style="color:#fff">${log.email}</strong> não receberá mais campanhas do PagDepix.</p>
        <a href="${FRONTEND_URL}" style="color:#f97316;text-decoration:none">← Voltar ao PagDepix</a>
      </body></html>`);
  } catch (e: any) {
    return res.status(500).send('<html><body>Erro interno. Tente novamente.</body></html>');
  }
};

export const listUnsubscribed = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = 50;
    const [list, total] = await Promise.all([
      prisma.emailUnsubscribe.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailUnsubscribe.count(),
    ]);
    return res.json({ list, total, page });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao listar descadastrados' });
  }
};

/* ─── Templates ────────────────────────────────────────────────────────────── */

export const listTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ templates });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao listar templates' });
  }
};

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId as string;
    const { name, description, subject, htmlBody } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (!subject?.trim()) return res.status(400).json({ error: 'Assunto é obrigatório' });
    if (!htmlBody?.trim()) return res.status(400).json({ error: 'HTML é obrigatório' });

    const template = await prisma.emailTemplate.create({
      data: { name: name.trim(), description, subject: subject.trim(), htmlBody, createdBy: adminId },
    });
    return res.status(201).json({ template });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao criar template' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { name, description, subject, htmlBody } = req.body;
    const template = await prisma.emailTemplate.update({
      where: { id: p(req.params.id) },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(subject !== undefined && { subject: subject.trim() }),
        ...(htmlBody !== undefined && { htmlBody }),
      },
    });
    return res.json({ template });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao atualizar template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    await prisma.emailTemplate.delete({ where: { id: p(req.params.id) } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao deletar template' });
  }
};

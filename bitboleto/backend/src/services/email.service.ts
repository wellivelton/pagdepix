import { Resend } from 'resend';

const FROM = 'PagDepix <no-reply@mail.pagdepix.com>';

let resend: Resend | null = null;

/**
 * Inicializa o cliente Resend com a API Key.
 * Se RESEND_API_KEY não estiver definida, os métodos não enviam email (modo dev).
 */
export function initEmailService(): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    resend = new Resend(apiKey);
  }
}

/**
 * Verifica se o serviço de email está configurado.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Envia email genérico (assunto + corpo).
 */
export async function sendGenericEmail(to: string, subject: string, text: string): Promise<void> {
  if (!isEmailConfigured() || !resend) {
    console.warn('[Email] RESEND_API_KEY não definida. Email não enviado.', { to, subject });
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text,
    html: `<div style="font-family: sans-serif;">${text.replace(/\n/g, '<br>')}</div>`,
  });

  if (error) {
    console.error('[Email] Erro ao enviar:', error);
    throw error;
  }
}

/**
 * Envia email de verificação com código de 6 dígitos (sem link).
 * O usuário digita o código na página de confirmação.
 * @param expiryMinutes Tempo de expiração em minutos (padrão: 30)
 */
export async function sendVerificationCodeEmail(to: string, code: string, expiryMinutes = 30): Promise<void> {
  if (!isEmailConfigured() || !resend) {
    console.warn('[Email] RESEND_API_KEY não definida. Email de verificação não enviado.', { to });
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'PagDepix – Código de verificação',
    text: `Olá,\n\nSeu código de verificação do PagDepix é:\n\n${code}\n\nDigite este código na página de confirmação da sua conta. O código expira em ${expiryMinutes} minutos.\n\nSe você não criou uma conta, ignore este email.\n\n— Equipe PagDepix`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Olá,</p>
        <p>Seu código de verificação do <strong>PagDepix</strong> é:</p>
        <p style="margin: 24px 0; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #f7931a;">${code}</p>
        <p style="color: #666; font-size: 14px;">Digite este código na página de cadastro.</p>
        <p style="color: #666; font-size: 14px;">O código expira em ${expiryMinutes} minutos.</p>
        <p style="color: #666; font-size: 14px;">Se você não solicitou este código, ignore este email.</p>
        <p>— Equipe PagDepix</p>
      </div>
    `,
  });

  if (error) {
    console.error('[Email] Erro ao enviar email de verificação:', error);
    throw error;
  }
}

/**
 * Envia email de recuperação de senha.
 * Link: https://pagdepix.com/reset-password?token=TOKEN
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  if (!isEmailConfigured() || !resend) {
    const baseUrl = (process.env.FRONTEND_URL || 'https://pagdepix.com').replace(/\/$/, '');
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    console.warn('[Email] RESEND_API_KEY não definida. Email de recuperação não enviado.', { to, resetUrl });
    return;
  }

  const baseUrl = (process.env.FRONTEND_URL || 'https://pagdepix.com').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'PagDepix – Recuperação de senha',
    text: `Olá,\n\nVocê solicitou a redefinição de senha no PagDepix. Clique no link abaixo para definir uma nova senha:\n\n${resetUrl}\n\nEste link expira em 30 minutos.\n\nSe você não solicitou isso, ignore este email. Sua senha permanecerá inalterada.\n\n— Equipe PagDepix`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Olá,</p>
        <p>Você solicitou a redefinição de senha no <strong>PagDepix</strong>. Clique no link abaixo para definir uma nova senha:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #f7931a; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Redefinir senha</a>
        </p>
        <p style="color: #666; font-size: 14px;">Ou copie e cole no navegador:</p>
        <p style="word-break: break-all; font-size: 12px; color: #666;">${resetUrl}</p>
        <p style="color: #666; font-size: 14px;">Este link expira em 30 minutos.</p>
        <p style="color: #666; font-size: 14px;">Se você não solicitou isso, ignore este email. Sua senha permanecerá inalterada.</p>
        <p>— Equipe PagDepix</p>
      </div>
    `,
  });

  if (error) {
    console.error('[Email] Erro ao enviar email de recuperação:', error);
    throw error;
  }
}

/**
 * Envia email de notificação de pagamento confirmado para comerciante.
 */
export async function sendPaymentNotificationEmail(
  to: string,
  merchantName: string,
  paymentData: {
    amount: number;
    linkTitle: string;
    orderId: string;
    paymentDate: string;
  }
): Promise<void> {
  if (!isEmailConfigured() || !resend) {
    console.warn('[Email] RESEND_API_KEY não definida. Email de notificação de pagamento não enviado.', { to, paymentData });
    return;
  }

  const formattedAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(paymentData.amount);

  const formattedDate = new Date(paymentData.paymentDate).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Pagamento recebido - ${formattedAmount}`,
    text: `Olá ${merchantName},\n\nVocê recebeu um novo pagamento!\n\nDetalhes:\n- Valor: ${formattedAmount}\n- Link: ${paymentData.linkTitle}\n- ID do Pedido: ${paymentData.orderId}\n- Data: ${formattedDate}\n\nAcesse seu painel para ver mais detalhes.\n\n— Equipe PagDepix`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 24px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #f7931a; margin: 0;">💰 Pagamento Recebido!</h1>
        </div>
        <p style="font-size: 16px; margin-bottom: 24px;">Olá <strong>${merchantName}</strong>,</p>
        <p style="font-size: 16px; margin-bottom: 24px;">Você recebeu um novo pagamento através do Modo Comércio!</p>

        <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 24px 0;">
          <div style="margin-bottom: 16px;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">Valor</p>
            <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: bold; color: #10b981;">${formattedAmount}</p>
          </div>
          <div style="margin-bottom: 16px; padding-top: 16px; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">Link</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #fff;">${paymentData.linkTitle}</p>
          </div>
          <div style="margin-bottom: 16px; padding-top: 16px; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">ID do Pedido</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; font-family: monospace; color: #fff;">${paymentData.orderId}</p>
          </div>
          <div style="padding-top: 16px; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">Data e Hora</p>
            <p style="margin: 4px 0 0 0; font-size: 14px; color: #fff;">${formattedDate}</p>
          </div>
        </div>

        <p style="color: #999; font-size: 14px; margin-top: 24px;">
          Acesse seu painel para ver mais detalhes e gerenciar seus pagamentos.
        </p>

        <p style="color: #666; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #333;">
          — Equipe PagDepix
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[Email] Erro ao enviar email de notificação de pagamento:', error);
    throw error;
  }

  console.log('[Email] Notificação de pagamento enviada com sucesso:', { to, orderId: paymentData.orderId });
}

/**
 * Envia email ao comprador informando que o pedido está aguardando confirmação de pagamento.
 */
export async function sendMarketplaceOrderPendingEmail(
  to: string,
  buyerName: string,
  orderData: {
    productTitle: string;
    orderId: string;
    amount: number;
    expiresAt?: string;
  }
): Promise<void> {
  if (!isEmailConfigured() || !resend) {
    console.warn('[Email] RESEND_API_KEY não definida. Email de pedido marketplace não enviado.', { to, orderId: orderData.orderId });
    return;
  }

  const formattedAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(orderData.amount);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `PagDepix – Pedido aguardando pagamento: ${orderData.productTitle}`,
    text: `Olá ${buyerName},\n\nSeu pedido foi registrado com sucesso e está aguardando a confirmação do pagamento.\n\nProduto: ${orderData.productTitle}\nValor: ${formattedAmount}\nID do Pedido: ${orderData.orderId}\n\nAcesse sua conta no PagDepix para realizar o pagamento via PIX. O pedido será liberado automaticamente após a confirmação.\n\n— Equipe PagDepix`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 24px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #f7931a; margin: 0;">🛒 Pedido Registrado</h1>
        </div>
        <p style="font-size: 16px; margin-bottom: 24px;">Olá <strong>${buyerName}</strong>,</p>
        <p style="font-size: 16px; margin-bottom: 24px;">Seu pedido foi registrado com sucesso e está aguardando a confirmação do pagamento via PIX.</p>

        <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 24px 0;">
          <div style="margin-bottom: 16px;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">Produto</p>
            <p style="margin: 4px 0 0 0; font-size: 16px; color: #fff;">${orderData.productTitle}</p>
          </div>
          <div style="margin-bottom: 16px; padding-top: 16px; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">Valor</p>
            <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: bold; color: #f7931a;">${formattedAmount}</p>
          </div>
          <div style="padding-top: 16px; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999; font-size: 12px; text-transform: uppercase;">ID do Pedido</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; font-family: monospace; color: #fff;">${orderData.orderId}</p>
          </div>
        </div>

        <p style="color: #999; font-size: 14px; margin-top: 24px;">
          Acesse sua conta no PagDepix para realizar o pagamento via PIX. O produto será liberado automaticamente após a confirmação.
        </p>

        <p style="color: #666; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #333;">
          — Equipe PagDepix
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[Email] Erro ao enviar email de pedido marketplace:', error);
    return;
  }

  console.log('[Email] Email de pedido marketplace (aguardando pagamento) enviado:', { to, orderId: orderData.orderId });
}

/**
 * Envia email de campanha com HTML completo.
 * Retorna true em caso de sucesso, false em caso de falha.
 */
export async function sendCampaignEmail(
  to: string,
  subject: string,
  htmlBody: string,
  fromName: string = 'PagDepix',
): Promise<boolean> {
  if (!isEmailConfigured() || !resend) {
    console.warn('[Email] RESEND_API_KEY não definida. Email de campanha não enviado.', { to, subject });
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: `${fromName} <no-reply@mail.pagdepix.com>`,
      to,
      subject,
      html: htmlBody,
    });

    if (error) {
      console.error('[Email] Erro ao enviar email de campanha:', error, { to, subject });
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Email] Exceção ao enviar email de campanha:', e?.message, { to });
    return false;
  }
}

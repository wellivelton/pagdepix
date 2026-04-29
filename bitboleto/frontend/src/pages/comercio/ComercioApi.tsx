/**
 * Painel de API Gateway – gerenciar chaves e webhooks.
 * Integre pagamentos Pix no seu site ou aplicativo como gateway de pagamento.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

interface ApiKeyData {
  id: string;
  label: string;
  keyPrefix: string;
  isSandbox: boolean;
  isActive: boolean;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

interface NewKeyResult {
  id: string;
  key: string;
  secret: string;
  keyPrefix: string;
  label: string;
  isSandbox: boolean;
  warning: string;
}

const EVENT_LABELS: Record<string, string> = {
  'charge.created': 'Cobrança Criada',
  'charge.paid': 'Cobrança Paga',
  'charge.expired': 'Cobrança Expirada',
};

const ALL_EVENTS = Object.keys(EVENT_LABELS);

export default function ComercioApi() {
  const [tab, setTab] = useState<'keys' | 'webhooks' | 'docs'>('keys');
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyIsSandbox, setNewKeyIsSandbox] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['charge.paid']);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [error, setError] = useState('');
  const [webhooksError, setWebhooksError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setWebhooksError(null);
    try {
      const [keysRes, webhooksRes] = await Promise.allSettled([
        api.get('/commerce/api-keys'),
        api.get('/commerce/webhooks'),
      ]);
      if (keysRes.status === 'fulfilled') {
        setApiKeys(keysRes.value.data ?? []);
      } else {
        const status = keysRes.reason?.response?.status;
        const msg = status === 404
          ? 'API Keys indisponível (404). Faça o deploy do backend atualizado em produção.'
          : (keysRes.reason?.response?.data?.error || keysRes.reason?.message || 'Erro ao carregar API keys.');
        setError(msg);
      }
      if (webhooksRes.status === 'fulfilled') {
        setWebhooks(webhooksRes.value.data ?? []);
      } else {
        setWebhooks([]);
        const status = webhooksRes.reason?.response?.status;
        setWebhooksError(status === 404
          ? 'Webhooks indisponível (404). Faça o deploy do backend atualizado em produção.'
          : (webhooksRes.reason?.response?.data?.error || webhooksRes.reason?.message || 'Erro ao carregar webhooks'));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateKey = async () => {
    if (!newKeyLabel.trim()) return;
    setCreatingKey(true);
    setError('');
    try {
      const { data } = await api.post('/commerce/api-keys', { label: newKeyLabel.trim(), isSandbox: newKeyIsSandbox });
      setNewKey(data);
      setNewKeyLabel('');
      setNewKeyIsSandbox(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Tem certeza que deseja revogar esta API key?')) return;
    try {
      await api.delete(`/commerce/api-keys/${keyId}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao revogar');
    }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhookUrl.trim() || newWebhookEvents.length === 0) {
      setError('Informe a URL e pelo menos um evento');
      return;
    }
    setCreatingWebhook(true);
    setError('');
    try {
      const { data } = await api.post('/commerce/webhooks', {
        url: newWebhookUrl.trim(),
        events: newWebhookEvents,
      });
      setNewWebhookSecret(data.secret);
      setNewWebhookUrl('');
      setNewWebhookEvents(['charge.paid']);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (endpointId: string) => {
    if (!confirm('Remover este webhook?')) return;
    try {
      await api.delete(`/commerce/webhooks/${endpointId}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao remover');
    }
  };

  const toggleEvent = (event: string) => {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-bitcoin border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const API_BASE = import.meta.env.VITE_API_URL
    ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '') + '/api'
    : 'https://api.pagdepix.com/api';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">API Gateway</h1>
        <p className="text-gray-400 text-sm mt-1">
          Integre pagamentos Pix no seu site ou aplicativo. Crie cobranças, exiba o QR Code e receba em Depix com liquidação D+1.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {(['keys', 'webhooks', 'docs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-bitcoin text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'keys' ? 'API Keys' : t === 'webhooks' ? 'Webhooks' : 'Documentação'}
          </button>
        ))}
      </div>

      {tab === 'keys' && (
        <div className="space-y-4">
          {newKey && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
              <h3 className="text-green-400 font-bold">API Key criada com sucesso!</h3>
              <p className="text-yellow-300 text-xs font-bold">{newKey.warning}</p>
              <div className="space-y-1">
                <div className="text-sm text-gray-300">
                  <span className="text-gray-500">Key: </span>
                  <code className="bg-gray-800 px-2 py-0.5 rounded text-green-300 break-all">{newKey.key}</code>
                </div>
                <div className="text-sm text-gray-300">
                  <span className="text-gray-500">Secret: </span>
                  <code className="bg-gray-800 px-2 py-0.5 rounded text-green-300 break-all">{newKey.secret}</code>
                </div>
              </div>
              <button onClick={() => setNewKey(null)} className="text-sm text-gray-400 hover:text-white mt-2">Fechar</button>
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="text-white font-semibold">Criar nova API Key</h3>
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Label (ex: Meu Sistema)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="flex-1 min-w-[200px] bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-bitcoin focus:outline-none"
              />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={newKeyIsSandbox}
                  onChange={(e) => setNewKeyIsSandbox(e.target.checked)}
                  className="rounded"
                />
                Sandbox
              </label>
              <button
                onClick={handleCreateKey}
                disabled={creatingKey || !newKeyLabel.trim()}
                className="bg-bitcoin hover:bg-bitcoin/80 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {creatingKey ? 'Criando...' : 'Criar Key'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {apiKeys.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhuma API key criada.</p>
            ) : (
              apiKeys.map((key) => (
                <div key={key.id} className="bg-gray-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{key.label}</span>
                      {key.isSandbox && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Sandbox</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${key.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {key.isActive ? 'Ativa' : 'Revogada'}
                      </span>
                    </div>
                    <div className="text-gray-400 text-xs space-x-4">
                      <span>Prefixo: <code className="text-gray-300">{key.keyPrefix}...</code></span>
                      <span>Requests: {key.requestCount}</span>
                      {key.lastUsedAt && <span>Último uso: {new Date(key.lastUsedAt).toLocaleDateString('pt-BR')}</span>}
                    </div>
                  </div>
                  {key.isActive && (
                    <button onClick={() => handleRevokeKey(key.id)} className="text-red-400 hover:text-red-300 text-sm">
                      Revogar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-4">
          {webhooksError && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
              {webhooksError}
            </div>
          )}
          {newWebhookSecret && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
              <h3 className="text-green-400 font-bold">Webhook criado!</h3>
              <p className="text-yellow-300 text-xs font-bold">Guarde o secret. Ele não será exibido novamente.</p>
              <code className="bg-gray-800 px-2 py-1 rounded text-green-300 text-sm break-all block">{newWebhookSecret}</code>
              <button onClick={() => setNewWebhookSecret('')} className="text-sm text-gray-400 hover:text-white mt-2">Fechar</button>
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="text-white font-semibold">Novo Webhook Endpoint</h3>
            <input
              type="url"
              placeholder="https://seusite.com/webhook"
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-bitcoin focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newWebhookEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="rounded"
                  />
                  {EVENT_LABELS[event]}
                </label>
              ))}
            </div>
            <button
              onClick={handleCreateWebhook}
              disabled={creatingWebhook || !newWebhookUrl.trim()}
              className="bg-bitcoin hover:bg-bitcoin/80 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              {creatingWebhook ? 'Criando...' : 'Criar Webhook'}
            </button>
          </div>

          <div className="space-y-2">
            {webhooks.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhum webhook configurado.</p>
            ) : (
              webhooks.map((wh) => (
                <div key={wh.id} className="bg-gray-800 rounded-lg p-4 flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <code className="text-gray-300 text-sm break-all">{wh.url}</code>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {wh.events.map((e) => (
                        <span key={e} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{EVENT_LABELS[e] || e}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteWebhook(wh.id)} className="text-red-400 hover:text-red-300 text-sm">
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'docs' && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-8 text-sm text-gray-300 overflow-y-auto max-h-[70vh]">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">API Gateway – Pagamentos Pix</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Crie cobranças e receba o QR Code Pix na resposta. Integre no seu site ou app como gateway de pagamento. Autentique com <code className="bg-gray-700 px-1 rounded">X-API-Key</code> e <code className="bg-gray-700 px-1 rounded">X-API-Secret</code> (aba API Keys).
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Liquidação D+1: o cliente paga imediatamente via Pix; o Depix é creditado na sua carteira no dia útil seguinte. Use o webhook charge.paid para liberar o produto assim que o pagamento for confirmado.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">Base URL</h3>
            <code className="block bg-gray-900 p-3 rounded text-bitcoin">{API_BASE}/gateway</code>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">Endpoints</h3>
            <ul className="space-y-3">
              <li>
                <code className="bg-gray-700 px-1 rounded">POST /charges</code> — Criar cobrança. Retorna QR Code na resposta. Body: <code>{'{"amount": 99.90, "description": "Pedido #123", "metadata": {}, "expires_in_minutes": 30}'}</code>
              </li>
              <li>
                <code className="bg-gray-700 px-1 rounded">GET /charges/:id</code> — Consultar status da cobrança
              </li>
              <li>
                <code className="bg-gray-700 px-1 rounded">GET /charges/:id/qr</code> — Gerar novo QR Code (se o anterior expirou)
              </li>
              <li>
                <code className="bg-gray-700 px-1 rounded">GET /transactions</code> — Listar transações. Query: <code>?page=1&limit=20&status=paid</code>
              </li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">Valor mínimo: R$ 5,00. Para valores &gt;= R$ 500, informe payer_name e payer_tax_number no body.</p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">Exemplo – Criar cobrança (cURL)</h3>
            <pre className="bg-gray-900 p-4 rounded overflow-x-auto text-xs">
{`curl -X POST ${API_BASE}/gateway/charges \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sua_key" \\
  -H "X-API-Secret: seu_secret" \\
  -d '{"amount": 99.90, "description": "Assinatura Premium", "metadata": {"order_id": "12345"}}'`}
            </pre>
            <p className="text-gray-500 text-xs mt-2">Resposta inclui qr_image_url, qr_copy_paste, payment_url, order_id e settlement: &quot;D+1&quot;.</p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">Webhooks</h3>
            <p className="text-gray-400 text-sm mb-2">
              Configure um endpoint (aba Webhooks) e receba o evento <code className="bg-gray-700 px-1 rounded">charge.paid</code> quando o pagamento for confirmado. Valide a assinatura com o header <code className="bg-gray-700 px-1 rounded">X-PagDepix-Signature</code> (HMAC-SHA256 de timestamp.payload).
            </p>
            <p className="text-xs text-gray-500">Use o webhook para liberar o produto ou serviço imediatamente após a confirmação.</p>
          </div>
        </div>
      )}
    </div>
  );
}

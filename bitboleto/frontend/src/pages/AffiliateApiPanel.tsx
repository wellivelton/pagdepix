import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Zap, Key, Bell, FileCode, HelpCircle } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';

/** Base URL da API v1 para afiliados. Em produção: https://api.pagdepix.com/api/v1 (nunca www.pagdepix.com). */
function getApiV1BaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) {
    const base = env.replace(/\/api\/?$/, '');
    return `${base}/api/v1`;
  }
  return import.meta.env.DEV ? 'http://localhost:3001/api/v1' : 'https://api.pagdepix.com/api/v1';
}

const STORAGE_KEY_WELCOME = 'affiliate_api_welcome_dismissed';

function CodeBlock({ code, className = '' }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className={`relative group ${className}`}>
      <pre className="bg-gray-900 rounded p-3 pr-10 text-green-300 overflow-x-auto text-xs">{code}</pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition"
        title="Copiar"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

interface ApiKeyData {
  id: string;
  label: string;
  keyPrefix: string;
  isSandbox: boolean;
  isActive: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  ipWhitelist: string[];
  rateLimit: number;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

interface WebhookData {
  id: string;
  apiKeyId: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  secret?: string;
  _count?: { deliveries: number };
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

interface ApiTransaction {
  id: string;
  type: 'boleto' | 'recharge' | 'pix-copia-cola';
  amount: number;
  totalAmount: number;
  status: string;
  paymentCurrency: string;
  externalRef: string | null;
  isSandbox: boolean;
  createdAt: string;
  nomeDestinatario?: string;
}

const EVENT_LABELS: Record<string, string> = {
  'payment.received': 'Boleto — TXID recebido',
  'payment.approved': 'Boleto — Aprovado',
  'payment.refused': 'Boleto — Recusado',
  'recharge.completed': 'Recarga — Concluída',
  'recharge.refused': 'Recarga — Recusada',
  'pix.received': 'Pix C&C — TXID recebido',
  'pix.approved': 'Pix C&C — Aprovado',
  'pix.refused': 'Pix C&C — Recusado',
};

const ALL_EVENTS = Object.keys(EVENT_LABELS);

export default function AffiliateApiPanel() {
  const toast = useToast();
  const [tab, setTab] = useState<'start' | 'keys' | 'webhooks' | 'transactions' | 'docs'>('start');
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem(STORAGE_KEY_WELCOME);
  });
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyIsSandbox, setNewKeyIsSandbox] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);

  const [newWebhookApiKeyId, setNewWebhookApiKeyId] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [regeneratedSecret, setRegeneratedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [codeLang, setCodeLang] = useState<'curl' | 'javascript' | 'python'>('curl');

  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, webhooksRes, txRes] = await Promise.all([
        api.get('/affiliate/api-keys'),
        api.get('/affiliate/webhooks'),
        api.get('/affiliate/api-transactions'),
      ]);
      setApiKeys(keysRes.data);
      setWebhooks(webhooksRes.data);
      setTransactions(txRes.data.data || []);
    } catch {
      setError('Erro ao carregar dados');
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
      const { data } = await api.post('/affiliate/api-keys', { label: newKeyLabel, isSandbox: newKeyIsSandbox });
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
      await api.delete(`/affiliate/api-keys/${keyId}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao revogar API key');
    }
  };

  const handleCreateWebhook = async () => {
    if (!newWebhookApiKeyId || !newWebhookUrl || newWebhookEvents.length === 0) {
      setError('Preencha todos os campos do webhook');
      return;
    }
    setCreatingWebhook(true);
    setError('');
    try {
      const { data } = await api.post('/affiliate/webhooks', {
        apiKeyId: newWebhookApiKeyId,
        url: newWebhookUrl,
        events: newWebhookEvents,
      });
      setNewWebhookSecret(data.secret);
      setNewWebhookUrl('');
      setNewWebhookEvents([]);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (endpointId: string) => {
    if (!confirm('Desativar este webhook?')) return;
    try {
      await api.delete(`/affiliate/webhooks/${endpointId}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desativar webhook');
    }
  };

  const handleRegenerateSecret = async (endpointId: string) => {
    if (!confirm('Regenerar o secret? O secret atual deixará de funcionar. Atualize sua integração com o novo.')) return;
    setRegeneratingId(endpointId);
    setError('');
    try {
      const { data } = await api.post(`/affiliate/webhooks/${endpointId}/regenerate-secret`);
      setRegeneratedSecret({ id: endpointId, secret: data.secret });
      setRegeneratingId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao regenerar secret');
      setRegeneratingId(null);
    }
  };

  const toggleEvent = (event: string) => {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const statusColor = (status: string) => {
    if (status === 'PAID') return 'text-green-400';
    if (status === 'PENDING') return 'text-yellow-400';
    if (status === 'CANCELLED' || status === 'PROBLEM') return 'text-red-400';
    return 'text-gray-400';
  };

  const statusTooltip = (status: string) => {
    const tips: Record<string, string> = {
      PENDING: 'Aguardando o cliente enviar o TXID ou aprovação da equipe',
      PAID: 'Pagamento aprovado e concluído',
      CANCELLED: 'Cancelado ou expirado',
      PROBLEM: 'Problema no pagamento — verifique com o suporte',
    };
    return tips[status] || status;
  };

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem(STORAGE_KEY_WELCOME, '1');
  };

  const hasKey = apiKeys.length > 0;
  const hasWebhook = webhooks.length > 0;
  const hasTested = transactions.length > 0;
  const checklistDone = [hasKey, hasWebhook, hasTested].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-bitcoin border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">API White-Label</h1>
      <p className="text-gray-400 text-sm">Integre pagamentos de boletos e recargas diretamente na sua plataforma.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* Welcome Modal - primeira visita */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-800 rounded-2xl border border-gray-600 max-w-md w-full p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-2">Seu primeiro pagamento em 3 passos</h2>
            <p className="text-gray-400 text-sm mb-6">Integre boletos e recargas na sua plataforma em poucos minutos.</p>
            <div className="space-y-4 mb-6">
              <button onClick={() => { dismissWelcome(); setTab('keys'); }} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-bitcoin/20 border border-gray-600 hover:border-bitcoin/50 transition text-left">
                <Key className="w-5 h-5 text-bitcoin" />
                <div>
                  <span className="font-medium text-white block">1. Criar API Key</span>
                  <span className="text-xs text-gray-400">Obtenha suas chaves de acesso</span>
                </div>
              </button>
              <button onClick={() => { dismissWelcome(); setTab('webhooks'); }} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-bitcoin/20 border border-gray-600 hover:border-bitcoin/50 transition text-left">
                <Bell className="w-5 h-5 text-bitcoin" />
                <div>
                  <span className="font-medium text-white block">2. Webhook (recomendado)</span>
                  <span className="text-xs text-gray-400">Receba notificações e evite polling excessivo</span>
                </div>
              </button>
              <button onClick={() => { dismissWelcome(); setTab('docs'); }} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-bitcoin/20 border border-gray-600 hover:border-bitcoin/50 transition text-left">
                <FileCode className="w-5 h-5 text-bitcoin" />
                <div>
                  <span className="font-medium text-white block">3. Documentação</span>
                  <span className="text-xs text-gray-400">Exemplos de integração</span>
                </div>
              </button>
            </div>
            <button onClick={dismissWelcome} className="w-full py-2 text-sm text-gray-400 hover:text-white">
              Não mostrar novamente
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 flex-wrap">
        {(['start', 'keys', 'webhooks', 'transactions', 'docs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-bitcoin text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'start' ? 'Início' : t === 'keys' ? 'API Keys' : t === 'webhooks' ? 'Webhooks' : t === 'transactions' ? 'Transações' : 'Documentação'}
          </button>
        ))}
      </div>

      {/* Início / Quick Start Tab */}
      {tab === 'start' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-bitcoin" />
              Setup Checklist
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('keys')}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasKey ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'}`}>
                  {hasKey ? '✓' : '1'}
                </span>
                <span className={hasKey ? 'text-green-400' : 'text-white'}>API Key criada</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('keys')}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasKey ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'}`}>
                  {hasKey ? '✓' : '2'}
                </span>
                <span className={hasKey ? 'text-green-400' : 'text-gray-400'}>Secret salvo em segurança</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('docs')}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs bg-gray-600 text-gray-400`}>3</span>
                <span className="text-gray-400">Primeiro teste com cURL executado</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setTab('webhooks')}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasWebhook ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'}`}>
                  {hasWebhook ? '✓' : '4'}
                </span>
                <span className={hasWebhook ? 'text-green-400' : 'text-gray-400'}>Webhook configurado (recomendado)</span>
              </label>
              <label className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs bg-gray-600 text-gray-400`}>5</span>
                <span className="text-gray-400">Validação de assinatura implementada</span>
              </label>
              <label className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs bg-gray-600 text-gray-400`}>6</span>
                <span className="text-gray-400">Pronto para produção!</span>
              </label>
            </div>
            <p className="mt-4 text-sm text-gray-500">Progresso: {checklistDone}/6 etapas</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Fluxo do pagamento</h3>
            <div className="font-mono text-xs text-gray-400 space-y-2 p-4 bg-gray-900/50 rounded-lg overflow-x-auto">
              <p><span className="text-bitcoin">SEU SISTEMA</span> → POST /boleto/create</p>
              <p className="text-gray-500">  ↓ retorna: walletAddress, cryptoAmount, id</p>
              <p><span className="text-bitcoin">CLIENTE</span> → Envia cripto para o endereço</p>
              <p className="text-gray-500">  ↓ clica &quot;Paguei&quot; e copia TXID</p>
              <p><span className="text-bitcoin">SEU SISTEMA</span> → POST /boleto/:id/txid</p>
              <p className="text-gray-500">  ↓ aguarda aprovação</p>
              <p><span className="text-green-400">GET</span> /boleto/:id/status → PAID ✓</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('keys')} className="bg-bitcoin hover:bg-bitcoin/80 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Criar API Key
            </button>
            <button onClick={() => setTab('docs')} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Ver Documentação
            </button>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {tab === 'keys' && (
        <div className="space-y-4">
          {newKey && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
              <h3 className="text-green-400 font-bold">API Key criada com sucesso!</h3>
              <p className="text-yellow-300 text-xs font-bold">{newKey.warning}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Key:</span>
                  <code className="flex-1 bg-gray-800 px-2 py-0.5 rounded text-green-300 break-all text-xs">{newKey.key}</code>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(newKey.key); toast.success('Key copiada!'); }} className="p-1.5 rounded bg-gray-700 hover:bg-gray-600">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Secret:</span>
                  <code className="flex-1 bg-gray-800 px-2 py-0.5 rounded text-green-300 break-all text-xs">{newKey.secret}</code>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(newKey.secret); toast.success('Secret copiado!'); }} className="p-1.5 rounded bg-gray-700 hover:bg-gray-600">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-amber-300/90 text-xs">Salve o secret agora — ele não será exibido novamente.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setNewKey(null); setTab('webhooks'); }} className="text-sm bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin px-3 py-1.5 rounded font-medium">
                  Configurar Webhook
                </button>
                <button onClick={() => setNewKey(null)} className="text-sm text-gray-400 hover:text-white">Fechar</button>
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="text-white font-semibold">Criar nova API Key</h3>
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Label (ex: Meu Site)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="flex-1 min-w-[200px] bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-bitcoin focus:outline-none"
              />
              <label className="flex items-center gap-2 text-sm text-gray-300" title="Sandbox: transações fictícias para testes">
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
            <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50 text-xs">
              <h4 className="text-gray-300 font-medium mb-2 flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" /> Sandbox vs Produção</h4>
              <div className="grid sm:grid-cols-2 gap-2 text-gray-400">
                <div><span className="text-amber-400">🧪 Sandbox:</span> Transações fictícias. Use para testar antes de ir ao vivo.</div>
                <div><span className="text-green-400">Produção:</span> Transações reais. Só ative quando tiver testado no Sandbox.</div>
              </div>
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
                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === 'webhooks' && (
        <div className="space-y-4">
          <div className="bg-bitcoin/10 border border-bitcoin/30 rounded-lg p-4">
            <h4 className="text-bitcoin font-semibold mb-1">Webhook é o método recomendado</h4>
            <p className="text-gray-300 text-sm">Configure webhooks para receber notificações automáticas. Evite polling frequente — use intervalo de 15–30s apenas como fallback.</p>
          </div>
          {(newWebhookSecret || regeneratedSecret) && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
              <h3 className="text-green-400 font-bold">{regeneratedSecret ? 'Secret regenerado!' : 'Webhook criado!'}</h3>
              <p className="text-yellow-300 text-xs font-bold">Guarde o secret — ele não será exibido novamente.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-800 px-2 py-1 rounded text-green-300 text-sm break-all">{regeneratedSecret?.secret || newWebhookSecret}</code>
                <button type="button" onClick={() => { navigator.clipboard.writeText(regeneratedSecret?.secret || newWebhookSecret || ''); toast.success('Secret copiado!'); }} className="p-2 rounded bg-gray-700 hover:bg-gray-600">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => { setNewWebhookSecret(''); setRegeneratedSecret(null); }} className="text-sm text-gray-400 hover:text-white mt-2">Fechar</button>
            </div>
          )}

          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="text-white font-semibold">Novo Webhook Endpoint</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={newWebhookApiKeyId}
                onChange={(e) => setNewWebhookApiKeyId(e.target.value)}
                className="bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-bitcoin focus:outline-none"
              >
                <option value="">Selecione API Key</option>
                {apiKeys.filter((k) => k.isActive).map((k) => (
                  <option key={k.id} value={k.id}>{k.label} ({k.keyPrefix}...)</option>
                ))}
              </select>
              <input
                type="url"
                placeholder="https://seusite.com/webhook"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                className="bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-bitcoin focus:outline-none"
              />
            </div>
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
              disabled={creatingWebhook || !newWebhookApiKeyId || !newWebhookUrl}
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
                <div key={wh.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="space-y-1">
                      <code className="text-gray-300 text-sm break-all">{wh.url}</code>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {wh.events.map((e) => (
                          <span key={e} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{EVENT_LABELS[e] || e}</span>
                        ))}
                      </div>
                      <div className="text-gray-500 text-xs mt-1">
                        Entregas: {wh._count?.deliveries || 0} | {wh.isActive ? 'Ativo' : 'Inativo'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {wh.isActive && (
                        <>
                          <button
                            onClick={() => handleRegenerateSecret(wh.id)}
                            disabled={regeneratingId === wh.id}
                            className="text-amber-400 hover:text-amber-300 text-sm disabled:opacity-50"
                            title="Regenerar secret (atualize sua integração)"
                          >
                            {regeneratingId === wh.id ? '...' : 'Regenerar secret'}
                          </button>
                          <button onClick={() => handleDeleteWebhook(wh.id)} className="text-red-400 hover:text-red-300 text-sm">
                            Desativar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Nenhuma transação via API ainda.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="bg-gray-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">
                      {tx.type === 'boleto' ? 'Boleto' : tx.type === 'pix-copia-cola' ? 'Pix Copia e Cola' : 'Recarga'}
                    </span>
                    <span className={`text-xs font-semibold ${statusColor(tx.status)}`} title={statusTooltip(tx.status)}>{tx.status}</span>
                    {tx.isSandbox && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Sandbox</span>
                    )}
                    {tx.type === 'pix-copia-cola' && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">1% comissão</span>
                    )}
                  </div>
                  <div className="text-gray-400 text-xs space-x-3">
                    <span>R$ {tx.totalAmount?.toFixed(2)}</span>
                    <span>{tx.paymentCurrency}</span>
                    {tx.nomeDestinatario && <span>→ {tx.nomeDestinatario}</span>}
                    {tx.externalRef && <span>Ref: {tx.externalRef}</span>}
                    <span>{new Date(tx.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <code className="text-gray-500 text-xs">{tx.id.slice(0, 8)}...</code>
              </div>
            ))
          )}
        </div>
      )}

      {/* Docs Tab - Guia completo de integração */}
      {tab === 'docs' && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-8 text-sm text-gray-300 overflow-y-auto max-h-[70vh]">
          {/* Introdução */}
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Guia de Integração API PagDepix</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Esta API permite que seu site ou aplicativo ofereça pagamento de <strong className="text-white">boletos</strong>, <strong className="text-white">recargas de celular</strong> e <strong className="text-green-400">Pix Copia e Cola</strong> com criptomoedas (DePix, USDT, Bitcoin — todos na Liquid Network). A arquitetura recomendada usa <strong className="text-white">webhooks como método principal</strong> e <strong className="text-white">polling como fallback</strong>.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-bitcoin/5 border border-bitcoin/20 rounded-lg p-3 text-xs">
                <p className="text-bitcoin font-semibold mb-1">Boletos</p>
                <p className="text-gray-400">Taxa 2%–4% • Comissão 20% da margem</p>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs">
                <p className="text-purple-400 font-semibold mb-1">Recargas</p>
                <p className="text-gray-400">Taxa variável • Comissão sobre margem</p>
              </div>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-xs">
                <p className="text-green-400 font-semibold mb-1">Pix Copia e Cola ✨</p>
                <p className="text-gray-400">Taxa 3% fixa • Comissão <strong className="text-white">1% do valor</strong></p>
              </div>
            </div>
          </div>

          {/* Fluxo recomendado */}
          <div className="space-y-3 p-4 bg-bitcoin/5 rounded-lg border border-bitcoin/20">
            <h3 className="text-white font-semibold">Fluxo recomendado</h3>
            <div className="font-mono text-xs text-gray-400 space-y-1">
              <p>1. Criar pedido      → POST /api/v1/boleto/create | /recharge/create | /pix-copia-cola/create</p>
              <p>2. Cliente paga e envia TXID → PUT /api/v1/{"{tipo}"}/:id/txid</p>
              <p>3. Aguardar webhook  → PagDepix envia notificação quando status mudar</p>
              <p>4. Polling (fallback)→ GET /api/v1/{"{tipo}"}/:id/status | /pix-copia-cola/:id</p>
            </div>
          </div>

          {/* Por que webhook primeiro */}
          <div className="space-y-2 p-4 bg-green-500/5 rounded-lg border border-green-500/20">
            <h3 className="text-green-400 font-semibold">Por que webhook primeiro?</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-400 text-xs">
              <li><strong className="text-gray-300">Menos requisições:</strong> não precisa consultar status a cada 1–2 segundos</li>
              <li><strong className="text-gray-300">Evita rate limit:</strong> limite padrão é 60 req/min por API key</li>
              <li><strong className="text-gray-300">Experiência melhor:</strong> atualização imediata sem sobrecarga</li>
              <li><strong className="text-gray-300">Escalabilidade:</strong> sistemas com muitos usuários não estouram o limite</li>
            </ul>
          </div>

          {/* Passo a passo simplificado */}
          <div className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-white font-semibold">Como funciona (passo a passo)</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-400 text-sm">
              <li><strong className="text-gray-300">Crie uma API Key</strong> — na aba API Keys, clique em &quot;Criar Key&quot; e guarde a chave em local seguro.</li>
              <li><strong className="text-gray-300">Crie o boleto ou recarga</strong> — envie os dados para nossa API e receba o endereço e valor em cripto.</li>
              <li><strong className="text-gray-300">Mostre para o cliente</strong> — o cliente envia o valor em Depix, USDT ou Bitcoin para o endereço indicado.</li>
              <li><strong className="text-gray-300">Cliente envia o TXID</strong> — após o pagamento, o cliente informa o código da transação (TXID).</li>
              <li><strong className="text-gray-300">Configure webhook (recomendado)</strong> — receba notificações automáticas. Evite polling frequente (use 15–30s apenas como fallback).</li>
            </ol>
          </div>

          {/* Webhooks - Eventos suportados */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Webhooks — Eventos suportados</h3>
            <div className="bg-gray-900/50 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2 text-gray-300">Evento</th>
                    <th className="text-left p-2 text-gray-300">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  <tr className="border-b border-gray-800"><td colSpan={2} className="p-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Boletos</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">payment.received</td><td className="p-2 text-gray-400">TXID submetido pelo cliente, aguardando confirmação</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">payment.approved</td><td className="p-2 text-gray-400">Boleto aprovado e pago</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">payment.refused</td><td className="p-2 text-gray-400">Boleto recusado (TXID inválido, valor incorreto)</td></tr>
                  <tr className="border-b border-gray-800"><td colSpan={2} className="p-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Recargas</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">recharge.completed</td><td className="p-2 text-gray-400">Recarga executada com sucesso</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">recharge.refused</td><td className="p-2 text-gray-400">Recarga recusada</td></tr>
                  <tr className="border-b border-gray-800"><td colSpan={2} className="p-2 text-xs text-gray-500 font-semibold uppercase tracking-wide">Pix Copia e Cola</td></tr>
                  <tr><td className="p-2 text-green-400 font-mono">pix.received</td><td className="p-2 text-gray-400">TXID informado, aguardando verificação</td></tr>
                  <tr><td className="p-2 text-green-400 font-mono">pix.approved</td><td className="p-2 text-gray-400">Pix pago ao destinatário — comissão de 1% creditada</td></tr>
                  <tr><td className="p-2 text-green-400 font-mono">pix.refused</td><td className="p-2 text-gray-400">Pedido recusado (código inválido, TXID incorreto)</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Configuração de Webhooks */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Configuração de Webhooks</h3>
            <p className="text-gray-400 text-xs">No painel afiliado (<code className="text-gray-300 bg-gray-900 px-1 rounded">/afiliado/api</code> → aba Webhooks):</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-400 text-xs">
              <li>Selecione a API Key</li>
              <li>Informe a URL do seu endpoint (ex: <code className="text-gray-300 bg-gray-900 px-1 rounded">https://seusite.com/api/pagdepix-webhook</code>)</li>
              <li>Marque os eventos desejados</li>
              <li><strong className="text-amber-400">Guarde o Secret</strong> — ele é exibido apenas na criação</li>
            </ol>
          </div>

          {/* Payload do webhook */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Payload do webhook (exemplo)</h3>
            <CodeBlock code={`// Exemplo: pix.approved
{
  "event": "pix.approved",
  "transactionId": "uuid-do-pedido",
  "type": "pix-copia-cola",
  "data": {
    "pix_id": "uuid-do-pedido",
    "valorOriginal": 200.00,
    "valorTaxa": 6.00,
    "totalFinal": 206.00,
    "nomeDestinatario": "João Silva",
    "paymentCurrency": "DEPIX",
    "txid": "abc123...",
    "status": "approved",
    "externalRef": "pedido_123",
    "timestamp": "2026-04-24T10:20:00.000Z"
  },
  "timestamp": "2026-04-24T10:20:00.000Z",
  "isSandbox": false
}

// Exemplo: payment.approved (boleto)
{
  "event": "payment.approved",
  "transactionId": "uuid-do-boleto",
  "type": "boleto",
  "data": {
    "boleto_id": "uuid",
    "txid": "pix_txid",
    "amount": 100.00,
    "totalAmount": 105.00,
    "status": "approved",
    "timestamp": "2026-04-24T10:20:00.000Z"
  },
  "timestamp": "2026-04-24T10:20:00.000Z",
  "isSandbox": false
}`} />
          </div>

          {/* Assinatura */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Assinatura (X-PagDepix-Signature)</h3>
            <p className="text-gray-400 text-xs">Todo webhook inclui o header <code className="text-gray-300 bg-gray-900 px-1 rounded">X-PagDepix-Signature</code> (HMAC SHA256). Valide sempre com <code>crypto.timingSafeEqual</code>:</p>
            <CodeBlock code={`const crypto = require('crypto');

function validateWebhook(body, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hash, 'hex'));
}

app.post('/webhook/pagdepix', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-pagdepix-signature'];
  if (!validateWebhook(req.body.toString(), signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const payload = JSON.parse(req.body.toString());
  // processar evento...
  res.status(200).send('OK');
});`} />
          </div>

          {/* Retry e confiabilidade */}
          <div className="space-y-2 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-white font-semibold text-sm">Retry e confiabilidade</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-400 text-xs">
              <li><strong className="text-gray-300">Timeout:</strong> 5 segundos por tentativa</li>
              <li><strong className="text-gray-300">Retries:</strong> até 5 tentativas com backoff</li>
              <li><strong className="text-gray-300">Cronograma:</strong> 1ª imediata, 2ª 30s, 3ª 2min, 4ª 10min, 5ª 1h</li>
              <li><strong className="text-gray-300">Deduplicação:</strong> mesmo evento+transação não é enviado duas vezes em 10 minutos</li>
            </ul>
            <p className="text-amber-400 text-xs mt-2">Responda 200 rapidamente para evitar retries. Processe em background se precisar.</p>
          </div>

          {/* Polling fallback */}
          <div className="space-y-3 p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
            <h3 className="text-yellow-400 font-semibold">Polling (fallback)</h3>
            <p className="text-gray-400 text-xs">Use apenas quando webhook não foi configurado, falhou, ou precisa confirmar status manualmente.</p>
            <div className="mt-2 space-y-1 text-xs">
              <div><strong className="text-gray-300">Mínimo:</strong> <span className="text-gray-400">15 segundos</span></div>
              <div><strong className="text-gray-300">Recomendado:</strong> <span className="text-gray-400">30 segundos</span></div>
              <div><strong className="text-red-400">Evite:</strong> <span className="text-gray-400">1–2 segundos (causa rate limit)</span></div>
            </div>
          </div>

          {/* Rate limit */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold">Headers de rate limit</h3>
            <p className="text-gray-400 text-xs">Todas as respostas incluem:</p>
            <div className="bg-gray-900/50 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2 text-gray-300">Header</th>
                    <th className="text-left p-2 text-gray-300">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  <tr><td className="p-2 text-bitcoin font-mono">X-RateLimit-Limit</td><td className="p-2 text-gray-400">Máximo de requisições por minuto</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">X-RateLimit-Remaining</td><td className="p-2 text-gray-400">Requisições restantes na janela</td></tr>
                  <tr><td className="p-2 text-bitcoin font-mono">X-RateLimit-Reset</td><td className="p-2 text-gray-400">Timestamp Unix do reset</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-red-400 text-xs mt-2">Ao receber HTTP 429, aguarde o tempo no header <code className="text-gray-300 bg-gray-900 px-1 rounded">Retry-After</code> antes de tentar novamente.</p>
          </div>

          {/* API intermediária */}
          <div className="space-y-2 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-white font-semibold">API intermediária</h3>
            <p className="text-gray-400 text-xs mb-2">Se você expõe uma API que consome a PagDepix internamente:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-400 text-xs">
              <li><strong className="text-gray-300">Configure webhooks</strong> apontando para sua API</li>
              <li><strong className="text-gray-300">Propague eventos</strong> para seus clientes (push, websocket, etc.)</li>
              <li><strong className="text-gray-300">Cache o status</strong> — quando receber <code className="text-gray-300 bg-gray-900 px-0.5 rounded">recharge.completed</code>, atualize localmente</li>
              <li><strong className="text-gray-300">Polling interno</strong> — se webhook atrasar, consulte GET /recharge/:id/status com intervalo de 30s</li>
            </ol>
          </div>

          {/* Regenerar secret */}
          <div className="space-y-2 p-4 bg-amber-500/5 rounded-lg border border-amber-500/20">
            <h3 className="text-amber-400 font-semibold">Regenerar secret</h3>
            <p className="text-gray-400 text-xs">Se o secret for comprometido: Painel → Webhooks → Regenerar secret. O antigo deixa de funcionar imediatamente. Atualize sua integração com o novo.</p>
          </div>

          {/* Log de entregas */}
          <div className="space-y-2 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <h3 className="text-white font-semibold">Log de entregas</h3>
            <p className="text-gray-400 text-xs">Na aba Webhooks, visualize as últimas entregas por endpoint (status HTTP, tentativas, data). Use para depurar quando um webhook não for recebido.</p>
          </div>

          {/* Moeda de pagamento */}
          <div className="space-y-3 p-4 bg-bitcoin/5 rounded-lg border border-bitcoin/20">
            <h3 className="text-white font-semibold">Moeda de pagamento (paymentCurrency)</h3>
            <p className="text-gray-400 text-sm">
              O parâmetro <code className="text-bitcoin/80 bg-gray-900 px-1.5 py-0.5 rounded">paymentCurrency</code> define em qual criptomoeda o cliente vai pagar.
            </p>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                <span className="font-mono text-bitcoin font-medium">🔷 DEPIX</span>
                <p className="text-gray-400 text-xs mt-1">→ Cliente envia DPX. Rápido e barato. Ideal para: depósitos pequenos, uso interno.</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                <span className="font-mono text-green-400 font-medium">💵 USDT</span>
                <p className="text-gray-400 text-xs mt-1">→ Cliente envia USDT. Taxa fixa, sem volatilidade. Ideal para: valores altos, estabilidade.</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                <span className="font-mono text-amber-400 font-medium">₿ BTC</span>
                <p className="text-gray-400 text-xs mt-1">→ Cliente envia satoshis (L-BTC). Taxa em tempo real. Ideal para: usuários Bitcoin-first.</p>
              </div>
            </div>
            <div className="mt-3 p-3 bg-gray-900/30 rounded text-xs">
              <h4 className="text-gray-300 font-medium mb-2">Qual moeda escolher?</h4>
              <div className="space-y-1 text-gray-400">
                <p><strong className="text-gray-300">Marketplace/E-commerce:</strong> USDT + DEPIX (estável + rápido)</p>
                <p><strong className="text-gray-300">Cripto-nativo:</strong> DEPIX ou BTC (fee mínimo)</p>
                <p><strong className="text-gray-300">Recargas P2P:</strong> DEPIX (rápido e barato)</p>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-1">Se omitido, usa <code>DEPIX</code>. Na resposta: <code>walletAddress</code>, <code>cryptoAmount</code>, <code>paymentCurrency</code>, e para USDT/BTC: <code>exchangeRate</code>, <code>rateLockExpiresAt</code>.</p>
          </div>

          {/* Base URL - DESTACADO */}
          <div className="space-y-2 p-4 rounded-lg border-2 border-bitcoin/40 bg-bitcoin/5">
            <h3 className="text-white font-semibold">⚠️ Endpoint base (copie e use sempre)</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 bg-gray-900 px-3 py-2 rounded text-green-300 text-xs font-mono">{getApiV1BaseUrl()}</code>
              <button type="button" onClick={() => { navigator.clipboard.writeText(getApiV1BaseUrl()); toast.success('Base URL copiada!'); }} className="p-2 rounded bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-red-400/90 text-xs mt-2">❌ NÃO use: https://www.pagdepix.com/api/v1 — use sempre api.pagdepix.com</p>
          </div>

          {/* Autenticação */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold">Autenticação</h3>
            <p className="text-gray-400 text-sm">Todas as requisições precisam incluir sua API Key e Secret nos headers:</p>
            <CodeBlock code={`X-API-Key: bb_sua_api_key_aqui
X-API-Secret: bbs_seu_secret_aqui`} />
          </div>

          {/* Endpoints - Boleto */}
          <div className="space-y-4">
            <h3 className="text-white font-semibold">Boletos</h3>
            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                  <code className="text-gray-200">/rates</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Consultar cotações atuais (USD/BRL, BTC/BRL). Útil para exibir o valor em reais.</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/boleto/calculate</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Simular a taxa antes de criar o boleto. Útil para mostrar ao usuário quanto ele vai pagar.</p>
                <CodeBlock code={`{ "amount": 100, "paymentCurrency": "DEPIX" }
{ "amount": 100, "paymentCurrency": "USDT" }`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/boleto/create</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Criar o boleto. Retorna o endereço, valor em cripto, QR Code e ID para acompanhar.</p>
                <p className="text-gray-400 text-xs mb-1"><strong className="text-gray-300">Obrigatório:</strong> amount (R$), dueDate (data vencimento, formato AAAA-MM-DD)</p>
                <p className="text-gray-400 text-xs mb-1"><strong className="text-gray-300">Opcional:</strong> barcode, pdfUrl, pdfPassword, paymentCurrency (DEPIX, USDT ou BTC), externalRef (seu ID interno)</p>
                <CodeBlock code={`{ "amount": 150, "dueDate": "2026-03-20", "paymentCurrency": "DEPIX", "externalRef": "pedido-123" }`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/boleto/:id/txid</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Informar o TXID (código da transação) após o cliente ter pago. Substitua :id pelo ID retornado ao criar o boleto.</p>
                <CodeBlock code={`{ "txid": "hash_de_64_caracteres" }`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                  <code className="text-gray-200">/boleto/:id/status</code>
                </div>
                <p className="text-gray-400 text-xs">Consultar o status do boleto (PENDING, PAID, CANCELLED, PROBLEM).</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/boleto/:id/receipt</code>
                </div>
                <p className="text-gray-400 text-xs">Enviar comprovante em PDF ou imagem (multipart/form-data, campo &quot;receipt&quot;).</p>
              </div>
            </div>
          </div>

          {/* Endpoints - Recarga */}
          <div className="space-y-4">
            <h3 className="text-white font-semibold">Recargas de celular</h3>
            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                  <code className="text-gray-200">/recharge/operators</code>
                </div>
                <p className="text-gray-400 text-xs">Lista operadoras (Vivo, Claro, TIM, etc.) e valores disponíveis.</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/recharge/create</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Criar recarga. Obrigatório: operator, phoneNumber (ex: 11999999999), amount. Opcional: paymentCurrency (DEPIX, USDT, BTC), externalRef.</p>
                <CodeBlock code={`{ "operator": "Vivo", "phoneNumber": "11999999999", "amount": 30, "paymentCurrency": "USDT" }`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/recharge/:id/txid</code>
                </div>
                <p className="text-gray-400 text-xs">Informar o TXID após o pagamento da recarga.</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                  <code className="text-gray-200">/recharge/:id/status</code>
                </div>
                <p className="text-gray-400 text-xs">Consultar status da recarga.</p>
              </div>
            </div>
          </div>

          {/* Endpoints - Pix Copia e Cola */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold">Pix Copia e Cola</h3>
              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-semibold">Novo ✨</span>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-xs text-gray-400">
              Pague qualquer código Pix Copia e Cola usando criptomoedas. Taxa fixa de <strong className="text-white">3%</strong> sobre o valor. Sua comissão: <strong className="text-green-400">1% do valor principal</strong> por transação aprovada. Processamento em minutos.
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/pix-copia-cola/calculate</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Calcular taxa antes de criar o pedido. Retorna taxa, valor em cripto e validade da cotação.</p>
                <CodeBlock code={`{ "valorOriginal": 200, "paymentCurrency": "DEPIX", "couponCode": "CUPOM10" }`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono">POST</span>
                  <code className="text-gray-200">/pix-copia-cola/create</code>
                </div>
                <p className="text-gray-400 text-xs mb-2">Criar pedido. Retorna <code className="bg-gray-800 px-1 rounded">walletAddress</code> para pagamento cripto. Mínimo R$ 20,00.</p>
                <CodeBlock code={`{
  "codigoPix": "00020126580014br.gov.bcb.pix...",
  "valorOriginal": 200,
  "nomeDestinatario": "João Silva",
  "contatoEmail": "joao@email.com",
  "paymentCurrency": "DEPIX",
  "externalRef": "pedido_123",
  "isSandbox": false
}`} className="mt-1" />
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded font-mono">PUT</span>
                  <code className="text-gray-200">/pix-copia-cola/:id/txid</code>
                </div>
                <p className="text-gray-400 text-xs">Informar TXID após pagamento cripto. Aceita <code className="bg-gray-800 px-1 rounded">multipart/form-data</code> (com campo <code className="bg-gray-800 px-1 rounded">comprovante</code> opcional) ou JSON.</p>
              </div>
              <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                  <code className="text-gray-200">/pix-copia-cola/:id</code>
                </div>
                <p className="text-gray-400 text-xs">Consultar status do pedido. Status possíveis: <code className="bg-gray-800 px-1 rounded">PENDING</code> → <code className="bg-gray-800 px-1 rounded">TXID_SUBMITTED</code> → <code className="bg-gray-800 px-1 rounded">APPROVED</code> | <code className="bg-gray-800 px-1 rounded">REJECTED</code></p>
              </div>
            </div>
          </div>

          {/* Transações */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold">Listar transações</h3>
            <div className="p-3 bg-gray-900/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-mono">GET</span>
                <code className="text-gray-200">/transactions</code>
              </div>
              <p className="text-gray-400 text-xs">Listar todas as transações. Parâmetros: ?type=boleto|recharge|pix-copia-cola&status=PENDING|APPROVED&page=1&limit=20</p>
            </div>
          </div>

          {/* Exemplos multi-linguagem */}
          <div className="space-y-4">
            <h3 className="text-white font-semibold">Exemplos de integração</h3>
            <p className="text-gray-400 text-xs">Criar boleto de R$ 100 pagável em Depix. Substitua as chaves pelas suas.</p>
            <div className="flex gap-1 mb-2">
              {(['curl', 'javascript', 'python'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setCodeLang(lang)}
                  className={`px-3 py-1 rounded text-xs font-medium ${codeLang === lang ? 'bg-bitcoin text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
                >
                  {lang === 'curl' ? 'cURL' : lang === 'javascript' ? 'JavaScript' : 'Python'}
                </button>
              ))}
            </div>
            {codeLang === 'curl' && (
              <CodeBlock code={`curl -X POST ${getApiV1BaseUrl()}/boleto/create \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: bb_sua_key" \\
  -H "X-API-Secret: bbs_seu_secret" \\
  -d '{"amount": 100, "dueDate": "2026-03-15", "paymentCurrency": "DEPIX"}'`} />
            )}
            {codeLang === 'javascript' && (
              <CodeBlock code={`// npm install axios
import axios from 'axios';

const api = axios.create({
  baseURL: '${getApiV1BaseUrl()}',
  headers: {
    'X-API-Key': 'sua_key_aqui',
    'X-API-Secret': 'seu_secret_aqui',
  }
});

const { data } = await api.post('/boleto/create', {
  amount: 100,
  dueDate: '2026-03-15',
  paymentCurrency: 'DEPIX'
});

console.log('Endereço:', data.walletAddress);
console.log('Valor:', data.cryptoAmount);`} />
            )}
            {codeLang === 'python' && (
              <CodeBlock code={`# pip install requests
import requests

url = '${getApiV1BaseUrl()}/boleto/create'
headers = {
    'Content-Type': 'application/json',
    'X-API-Key': 'sua_key_aqui',
    'X-API-Secret': 'seu_secret_aqui',
}
payload = {'amount': 100, 'dueDate': '2026-03-15', 'paymentCurrency': 'DEPIX'}

r = requests.post(url, json=payload, headers=headers)
data = r.json()
print('Endereço:', data['walletAddress'])
print('Valor:', data['cryptoAmount'])`} />
            )}
          </div>

          {/* Glossário */}
          <div className="space-y-2 p-4 bg-gray-900/30 rounded-lg">
            <h3 className="text-white font-semibold">Termos explicados</h3>
            <dl className="text-gray-400 text-xs space-y-3">
              <div><dt className="font-medium text-gray-300">API Key / Secret</dt><dd>Chaves que identificam sua conta. Nunca exponha no frontend.</dd></div>
              <div><dt className="font-medium text-gray-300">TXID (Transaction ID)</dt><dd>Código único da transação na blockchain (64 caracteres hex). O cliente obtém na carteira ao enviar o pagamento. Cole em POST /boleto/:id/txid.</dd></div>
              <div><dt className="font-medium text-gray-300">Webhook</dt><dd>URL que recebe notificações automáticas quando um pagamento é aprovado ou recusado. Valide com X-PagDepix-Signature (HMAC SHA256).</dd></div>
              <div><dt className="font-medium text-gray-300">externalRef</dt><dd>ID interno do seu sistema (ex: número do pedido). Opcional, ajuda a cruzar dados.</dd></div>
              <div><dt className="font-medium text-gray-300">Sandbox</dt><dd>Modo de teste. Transações fictícias. Use para desenvolver antes de ir para produção.</dd></div>
              <div><dt className="font-medium text-gray-300">paymentCurrency</dt><dd>Moeda em que o cliente vai pagar: DEPIX (DPX), USDT (Tether), ou BTC (Bitcoin).</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

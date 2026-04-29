import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Users,
  CheckCircle,
  XCircle,
  HelpCircle,
  Smartphone,
  TrendingUp,
  Send,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '../../services/api';

interface PushMetrics {
  totalUsers: number;
  granted: number;
  denied: number;
  undecided: number;
  totalDevices: number;
  adoptionRate: number;
}

interface SubscriberUser {
  id: string;
  name: string;
  email: string;
  pushStatus: 'granted' | 'denied' | 'default';
  deviceCount: number;
  updatedAt: string | null;
}

type StatusFilter = 'all' | 'granted' | 'denied' | 'default';
type SendTarget = 'all' | 'segment' | 'users';
type SendSegment = 'affiliates' | 'commerce' | 'with_balance' | 'recent';

const STATUS_LABEL: Record<string, string> = {
  granted: 'Ativo',
  denied: 'Recusou',
  default: 'Indefinido',
};

const STATUS_COLOR: Record<string, string> = {
  granted: 'bg-green-500/20 text-green-400',
  denied: 'bg-red-500/20 text-red-400',
  default: 'bg-gray-600/40 text-gray-400',
};

const SEGMENT_LABEL: Record<SendSegment, string> = {
  affiliates: 'Afiliados',
  commerce: 'Comerciantes',
  with_balance: 'Com Saldo',
  recent: 'Ativos últimos 30 dias',
};

export default function AdminPushManager() {
  const [section, setSection] = useState<'metrics' | 'subscribers' | 'send'>('metrics');

  // Metrics
  const [metrics, setMetrics] = useState<PushMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Subscribers
  const [subscribers, setSubscribers] = useState<SubscriberUser[]>([]);
  const [subsTotal, setSubsTotal] = useState(0);
  const [subsTotalPages, setSubsTotalPages] = useState(1);
  const [subsPage, setSubsPage] = useState(1);
  const [subsFilter, setSubsFilter] = useState<StatusFilter>('all');
  const [subsSearch, setSubsSearch] = useState('');
  const [subsLoading, setSubsLoading] = useState(false);

  // Send
  const [sendTarget, setSendTarget] = useState<SendTarget>('all');
  const [sendSegment, setSendSegment] = useState<SendSegment>('affiliates');
  const [sendUserSearch, setSendUserSearch] = useState('');
  const [sendUserResults, setSendUserResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [sendSelectedUsers, setSendSelectedUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [sendTitle, setSendTitle] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendLink, setSendLink] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const loadMetrics = useCallback(() => {
    setMetricsLoading(true);
    api.get('/admin/push/metrics')
      .then(({ data }) => setMetrics(data))
      .catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false));
  }, []);

  const loadSubscribers = useCallback(() => {
    setSubsLoading(true);
    const params: Record<string, any> = { page: subsPage, limit: 50 };
    if (subsFilter !== 'all') params.status = subsFilter;
    api.get('/admin/push/subscribers', { params })
      .then(({ data }) => {
        setSubscribers(data.users || []);
        setSubsTotal(data.pagination?.total || 0);
        setSubsTotalPages(data.pagination?.totalPages || 1);
      })
      .catch(() => setSubscribers([]))
      .finally(() => setSubsLoading(false));
  }, [subsPage, subsFilter]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);
  useEffect(() => { if (section === 'subscribers') loadSubscribers(); }, [section, loadSubscribers]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setSendUserResults([]); return; }
    try {
      const { data } = await api.get('/admin/users', { params: { search: q, limit: 10 } });
      setSendUserResults((data.users || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
    } catch {
      setSendUserResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(sendUserSearch), 300);
    return () => clearTimeout(t);
  }, [sendUserSearch, searchUsers]);

  const handleSend = async () => {
    if (!sendTitle.trim() || !sendBody.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const payload: Record<string, any> = {
        target: sendTarget,
        title: sendTitle.trim(),
        body: sendBody.trim(),
        link: sendLink.trim() || undefined,
      };
      if (sendTarget === 'segment') payload.segment = sendSegment;
      if (sendTarget === 'users') payload.userIds = sendSelectedUsers.map((u) => u.id);

      const { data } = await api.post('/admin/push/send', payload);
      setSendResult({ sent: data.sent, failed: data.failed, total: data.total });
    } catch (err: any) {
      setSendResult({ sent: 0, failed: -1, total: 0 });
    } finally {
      setSending(false);
    }
  };

  const filteredSubs = subsSearch.trim()
    ? subscribers.filter(
        (u) =>
          u.name.toLowerCase().includes(subsSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(subsSearch.toLowerCase())
      )
    : subscribers;

  return (
    <div className="space-y-4">
      {/* Sub-navegação */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'metrics', label: 'Métricas', icon: TrendingUp },
          { key: 'subscribers', label: 'Inscritos', icon: Users },
          { key: 'send', label: 'Enviar Push', icon: Send },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              section === key
                ? 'bg-bitcoin text-black'
                : 'bg-gray-700/60 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── MÉTRICAS ── */}
      {section === 'metrics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Adoção de Push Notifications</h3>
            <button onClick={loadMetrics} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {metricsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-bitcoin animate-spin" /></div>
          ) : metrics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard icon={<Users className="w-5 h-5 text-blue-400" />} label="Total de Usuários" value={metrics.totalUsers.toLocaleString('pt-BR')} bg="blue" />
                <MetricCard icon={<CheckCircle className="w-5 h-5 text-green-400" />} label="Aceitaram Push" value={metrics.granted.toLocaleString('pt-BR')} bg="green" />
                <MetricCard icon={<XCircle className="w-5 h-5 text-red-400" />} label="Recusaram" value={metrics.denied.toLocaleString('pt-BR')} bg="red" />
                <MetricCard icon={<HelpCircle className="w-5 h-5 text-gray-400" />} label="Não Decidiram" value={metrics.undecided.toLocaleString('pt-BR')} bg="gray" />
                <MetricCard icon={<Smartphone className="w-5 h-5 text-purple-400" />} label="Dispositivos" value={metrics.totalDevices.toLocaleString('pt-BR')} bg="purple" />
                <MetricCard icon={<TrendingUp className="w-5 h-5 text-bitcoin" />} label="Taxa de Adesão" value={`${metrics.adoptionRate}%`} bg="bitcoin" highlight />
              </div>

              {/* Barra de progresso */}
              {metrics.totalUsers > 0 && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Distribuição de status</span>
                    <span className="text-sm text-gray-400">{metrics.totalUsers} usuários</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden gap-px">
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(metrics.granted / metrics.totalUsers) * 100}%` }}
                      title={`Aceitaram: ${metrics.granted}`}
                    />
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${(metrics.denied / metrics.totalUsers) * 100}%` }}
                      title={`Recusaram: ${metrics.denied}`}
                    />
                    <div
                      className="bg-gray-600 flex-1"
                      title={`Indefinido: ${metrics.undecided}`}
                    />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Aceitaram ({metrics.granted})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Recusaram ({metrics.denied})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" /> Indefinido ({metrics.undecided})</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm py-6 text-center">Falha ao carregar métricas.</p>
          )}
        </div>
      )}

      {/* ── INSCRITOS ── */}
      {section === 'subscribers' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'granted', 'denied', 'default'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { setSubsFilter(f); setSubsPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    subsFilter === f ? 'bg-bitcoin text-black' : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'granted' ? 'Ativos' : f === 'denied' ? 'Recusaram' : 'Indefinidos'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={subsSearch}
                onChange={(e) => setSubsSearch(e.target.value)}
                placeholder="Filtrar por nome/email"
                className="pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin w-56"
              />
            </div>
          </div>

          <div className="text-xs text-gray-500">{subsTotal.toLocaleString('pt-BR')} usuários</div>

          {subsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-bitcoin animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 bg-gray-800/40">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Usuário</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">Dispositivos</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Última atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredSubs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-500 py-8">Nenhum usuário encontrado</td>
                    </tr>
                  ) : (
                    filteredSubs.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white truncate max-w-[180px]">{u.name}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[180px]">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[u.pushStatus]}`}>
                            {STATUS_LABEL[u.pushStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-sm ${u.deviceCount > 0 ? 'text-white' : 'text-gray-600'}`}>
                            {u.deviceCount > 0 && <Smartphone className="w-3.5 h-3.5" />}
                            {u.deviceCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {u.updatedAt ? new Date(u.updatedAt).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {subsTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSubsPage((p) => Math.max(1, p - 1))}
                disabled={subsPage === 1}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500">Página {subsPage} de {subsTotalPages}</span>
              <button
                onClick={() => setSubsPage((p) => Math.min(subsTotalPages, p + 1))}
                disabled={subsPage === subsTotalPages}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ENVIAR PUSH ── */}
      {section === 'send' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Formulário */}
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 space-y-4">
            <h3 className="text-white font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-bitcoin" /> Compor Notificação</h3>

            {/* Target */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Público alvo</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'all', label: 'Todos' },
                  { value: 'segment', label: 'Segmento' },
                  { value: 'users', label: 'Específicos' },
                ] as { value: SendTarget; label: string }[]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setSendTarget(value); setSendResult(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sendTarget === value ? 'bg-bitcoin text-black' : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Segmento */}
            {sendTarget === 'segment' && (
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Segmento</label>
                <select
                  value={sendSegment}
                  onChange={(e) => setSendSegment(e.target.value as SendSegment)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-bitcoin"
                >
                  {(Object.entries(SEGMENT_LABEL) as [SendSegment, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Busca de usuários específicos */}
            {sendTarget === 'users' && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400 mb-1.5 block">Buscar usuários</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={sendUserSearch}
                    onChange={(e) => setSendUserSearch(e.target.value)}
                    placeholder="Nome ou email..."
                    className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin"
                  />
                </div>
                {sendUserResults.length > 0 && (
                  <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                    {sendUserResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          if (!sendSelectedUsers.find((s) => s.id === u.id)) {
                            setSendSelectedUsers((prev) => [...prev, u]);
                          }
                          setSendUserSearch('');
                          setSendUserResults([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0"
                      >
                        <div className="text-sm text-white">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                {sendSelectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sendSelectedUsers.map((u) => (
                      <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 bg-bitcoin/20 text-bitcoin text-xs rounded-full">
                        {u.name}
                        <button onClick={() => setSendSelectedUsers((prev) => prev.filter((s) => s.id !== u.id))} className="hover:text-white">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dicas de variáveis */}
            <div className="bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">Variáveis disponíveis</p>
              <div className="flex flex-wrap gap-1.5">
                {['{{nome}}', '{{email}}', '{{telegram}}', '{{saldo}}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSendBody((b) => b + v)}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded font-mono transition-colors"
                    title="Clique para inserir no corpo"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Substituídas pelo dado real de cada usuário no momento do envio</p>
            </div>

            {/* Título */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Título</label>
              <input
                value={sendTitle}
                onChange={(e) => setSendTitle(e.target.value)}
                maxLength={80}
                placeholder="Ex: 🔔 Olá {{nome}}, oferta especial..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin"
              />
              <div className="text-xs text-gray-600 mt-0.5 text-right">{sendTitle.length}/80</div>
            </div>

            {/* Mensagem */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Mensagem</label>
              <textarea
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Ex: Ei {{nome}}, seu saldo atual é {{saldo}}. Aproveite!"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin resize-none"
              />
              <div className="text-xs text-gray-600 mt-0.5 text-right">{sendBody.length}/200</div>
            </div>

            {/* Link */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Link de redirecionamento <span className="text-gray-600">(opcional)</span></label>
              <input
                value={sendLink}
                onChange={(e) => setSendLink(e.target.value)}
                placeholder="Ex: /historico ou https://..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={sending || !sendTitle.trim() || !sendBody.trim() || (sendTarget === 'users' && sendSelectedUsers.length === 0)}
              className="w-full py-2.5 rounded-xl bg-bitcoin text-black font-semibold text-sm hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Enviando...' : 'Enviar Notificação'}
            </button>

            {sendResult && (
              <div className={`rounded-xl p-3 text-sm ${sendResult.failed === -1 ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}>
                {sendResult.failed === -1 ? (
                  'Erro ao enviar. Tente novamente.'
                ) : (
                  <>
                    <span className="font-semibold">{sendResult.sent}</span> enviados
                    {sendResult.failed > 0 && <span className="text-yellow-400">, {sendResult.failed} falhas</span>}
                    <span className="text-gray-400 ml-1">/ {sendResult.total} total</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold text-sm">Preview</h3>
            <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-4">
              <div className="bg-white rounded-2xl p-3 shadow-lg max-w-[320px] mx-auto">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 leading-tight">
                      {(sendTitle || 'Título da notificação').replace(/\{\{nome\}\}/gi, 'João').replace(/\{\{email\}\}/gi, 'joao@...').replace(/\{\{telegram\}\}/gi, '@joao').replace(/\{\{saldo\}\}/gi, '1.2300 DEPIX')}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5 line-clamp-3">
                      {(sendBody || 'Corpo da mensagem aparecerá aqui...').replace(/\{\{nome\}\}/gi, 'João').replace(/\{\{email\}\}/gi, 'joao@...').replace(/\{\{telegram\}\}/gi, '@joao').replace(/\{\{saldo\}\}/gi, '1.2300 DEPIX')}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">pagdepix.com · agora</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 text-center mt-3">Aparência aproximada no dispositivo</p>
            </div>

            {/* Resumo do envio */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Público</span>
                <span className="text-white">
                  {sendTarget === 'all' ? 'Todos os inscritos' : sendTarget === 'segment' ? SEGMENT_LABEL[sendSegment] : `${sendSelectedUsers.length} usuário(s)`}
                </span>
              </div>
              {metrics && sendTarget === 'all' && (
                <div className="flex justify-between text-gray-400">
                  <span>Estimativa de alcance</span>
                  <span className="text-green-400">~{metrics.granted} usuários</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  bg,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  highlight?: boolean;
}) {
  const bgMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    gray: 'border-gray-600/40 bg-gray-700/20',
    purple: 'border-purple-500/30 bg-purple-500/5',
    bitcoin: 'border-bitcoin/30 bg-bitcoin/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${bgMap[bg] ?? bgMap.gray}`}>
      <div className="flex items-center justify-between mb-2">
        {icon}
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-bitcoin' : 'text-white'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

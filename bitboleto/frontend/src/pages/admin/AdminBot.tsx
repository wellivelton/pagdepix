import { useState, useEffect, useCallback } from 'react';
import {
  Users, CreditCard, BarChart2, Megaphone, Settings,
  Search, ChevronLeft, ChevronRight, RefreshCw,
  Ban, CheckCircle, Send, Bot, Loader2,
  TrendingUp, DollarSign, Clock, User, Shield
} from 'lucide-react';
import api from '../../services/api';

type BotTab = 'usuarios' | 'pagamentos' | 'metricas' | 'comunicacao' | 'configuracoes';

// ─── Sub: Métricas ────────────────────────────────────────────────────────────

function BotMetrics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/bot/metrics')
      .then(r => setData(r.data))
      .catch(() => setError('Erro ao carregar métricas'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-bitcoin" /></div>;
  if (error) return <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">{error}</div>;
  if (!data) return null;

  const cards = [
    { label: 'Usuários Totais', value: data.users.total, icon: Users, color: 'blue' },
    { label: 'Usuários Ativos', value: data.users.active, icon: CheckCircle, color: 'green' },
    { label: 'Usuários Bloqueados', value: data.users.blocked, icon: Ban, color: 'red' },
    { label: 'Pagamentos Totais', value: data.payments.total, icon: CreditCard, color: 'purple' },
    { label: 'Pagamentos Pagos', value: data.payments.paid, icon: TrendingUp, color: 'green' },
    { label: 'Pendentes', value: data.payments.pending, icon: Clock, color: 'yellow' },
    { label: 'Volume Total (R$)', value: `R$ ${Number(data.payments.volume).toFixed(2)}`, icon: DollarSign, color: 'bitcoin' },
    { label: 'Taxa de Conversão', value: `${data.payments.conversionRate}%`, icon: BarChart2, color: 'orange' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    bitcoin: 'bg-bitcoin/10 text-bitcoin border-bitcoin/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`p-4 rounded-xl border ${colorMap[c.color]}`}>
            <div className="flex items-center gap-2 mb-1">
              <c.icon className="w-4 h-4" />
              <span className="text-xs opacity-70">{c.label}</span>
            </div>
            <div className="text-xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
        <h3 className="font-medium text-gray-200 mb-3">Hoje</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Pagamentos pagos</p>
            <p className="text-lg font-semibold text-green-400">{data.today.paid}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Volume (R$)</p>
            <p className="text-lg font-semibold text-green-400">R$ {Number(data.today.volume).toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub: Usuários ────────────────────────────────────────────────────────────

function BotUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [limitInput, setLimitInput] = useState('');
  const [delayInput, setDelayInput] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20, status: statusFilter };
      if (search) params.search = search;
      const r = await api.get('/admin/bot/users', { params });
      setUsers(r.data.users);
      setPagination(r.data.pagination);
    } catch {
      setError('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: any) => {
    setActionLoading(true);
    try {
      const r = await api.patch(`/admin/bot/users/${id}`, body);
      setSelected(r.data.user);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro');
    } finally {
      setActionLoading(false);
    }
  };

  const sendMsg = async () => {
    if (!msgText.trim() || !selected) return;
    setMsgSending(true);
    try {
      await api.post('/admin/bot/message', { telegram_id: selected.telegram_id, text: msgText.trim() });
      setMsgText('');
      alert('Mensagem enviada!');
    } catch {
      alert('Erro ao enviar mensagem');
    } finally {
      setMsgSending(false);
    }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-white">{selected.nome || 'Sem nome'}</p>
              <p className="text-xs text-gray-400">@{selected.username || '—'} · ID {selected.telegram_id}</p>
            </div>
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${selected.status === 'ativo' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {selected.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-gray-700">
            <div><p className="text-gray-500">Limite diário</p><p className="text-white">R$ {selected.limite_custom ?? selected.limite_diario}</p></div>
            <div><p className="text-gray-500">Usado hoje</p><p className="text-white">R$ {selected.usado_hoje?.toFixed(2) ?? '0.00'}</p></div>
            <div><p className="text-gray-500">Criado em</p><p className="text-white">{selected.data_criacao ? new Date(selected.data_criacao).toLocaleDateString('pt-BR') : '—'}</p></div>
          </div>
        </div>

        <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
          <h4 className="font-medium text-gray-200">Ações</h4>
          <div className="flex gap-2 flex-wrap">
            {selected.status === 'ativo' ? (
              <button
                onClick={() => patch(selected.telegram_id, { status: 'bloqueado' })}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" /> Bloquear
              </button>
            ) : (
              <button
                onClick={() => patch(selected.telegram_id, { status: 'ativo' })}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/20 disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Desbloquear
              </button>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              placeholder="Novo limite (R$)"
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500"
            />
            <button
              onClick={() => patch(selected.telegram_id, { limite_custom: limitInput || null })}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm hover:bg-blue-500/20 disabled:opacity-50"
            >
              Definir limite
            </button>
            <button
              onClick={() => { setLimitInput(''); patch(selected.telegram_id, { limite_custom: null }); }}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-gray-700 border border-gray-600 text-gray-400 text-sm hover:bg-gray-600 disabled:opacity-50"
            >
              Resetar
            </button>
          </div>

          <div className="border-t border-gray-700 pt-3 space-y-3">
            <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-bitcoin" /> Controle de risco
            </h4>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-400 flex-1">
                Nível de confiança:{' '}
                <span className={selected.trusted ? 'text-green-400 font-medium' : 'text-yellow-400 font-medium'}>
                  {selected.trusted ? 'Confiável (entrega imediata)' : 'Normal (delay aplicado)'}
                </span>
              </span>
              <button
                onClick={() => patch(selected.telegram_id, { trusted: !selected.trusted })}
                disabled={actionLoading}
                className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${
                  selected.trusted
                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                    : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                }`}
              >
                {selected.trusted ? 'Remover confiança' : 'Marcar como confiável'}
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={delayInput}
                onChange={e => setDelayInput(e.target.value)}
                placeholder={`Delay atual: ${selected.delay_hours ?? 24}h`}
                min={0}
                max={720}
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500"
              />
              <button
                onClick={() => patch(selected.telegram_id, { delay_hours: parseInt(delayInput) })}
                disabled={actionLoading || !delayInput}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm hover:bg-blue-500/20 disabled:opacity-50"
              >
                Definir delay (h)
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
          <h4 className="font-medium text-gray-200">Enviar mensagem</h4>
          <textarea
            value={msgText}
            onChange={e => setMsgText(e.target.value)}
            rows={3}
            placeholder="Texto da mensagem (suporta Markdown)"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          <button
            onClick={sendMsg}
            disabled={msgSending || !msgText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bitcoin/10 border border-bitcoin/30 text-bitcoin text-sm hover:bg-bitcoin/20 disabled:opacity-50"
          >
            {msgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, @user ou Telegram ID"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="bloqueado">Bloqueados</option>
        </select>
        <button onClick={load} className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-bitcoin" /></div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <button
              key={u.telegram_id}
              onClick={() => setSelected(u)}
              className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-xl hover:border-gray-600 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.nome || 'Sem nome'}</p>
                <p className="text-xs text-gray-500">@{u.username || '—'} · ID {u.telegram_id}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.status === 'ativo' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {u.status}
                </span>
                <p className="text-xs text-gray-500 mt-1">{u['cobranças_pagas'] ?? u.cobranças_pagas ?? 0} pagos</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{pagination.total} usuários</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1">{page} / {pagination.pages}</span>
            <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub: Pagamentos ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pago:         'bg-green-500/20 text-green-400',
  pendente:     'bg-yellow-500/20 text-yellow-400',
  pix_recebido: 'bg-blue-500/20 text-blue-400',
  expirado:     'bg-gray-500/20 text-gray-400',
  cancelado:    'bg-red-500/20 text-red-400',
};

function BotPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);
  const [releasing, setReleasing] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/bot/payments', { params: { page, limit: 20, status: statusFilter } });
      setPayments(r.data.payments);
      setPagination(r.data.pagination);
    } catch {
      setError('Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const release = async (id: number) => {
    if (!confirm('Liberar este pagamento manualmente? O usuário será notificado pelo bot.')) return;
    setReleasing(id);
    try {
      await api.post(`/admin/bot/payments/${id}/release`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao liberar pagamento');
    } finally {
      setReleasing(null);
    }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="pix_recebido">PIX Recebido</option>
          <option value="pago">Pago</option>
          <option value="expirado">Expirado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button onClick={load} className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-bitcoin" /></div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="p-3 bg-gray-800 border border-gray-700 rounded-xl flex items-center gap-3">
              <CreditCard className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">R$ {Number(p.total_pagador).toFixed(2)}</p>
                <p className="text-xs text-gray-500 truncate">
                  {p.nome || `ID ${p.telegram_id}`}{p.username ? ` · @${p.username}` : ''}
                  {' · '}{new Date(p.criado_em).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-700 text-gray-400'}`}>
                {p.status}
              </span>
              {(p.status === 'pendente' || p.status === 'pix_recebido') && (
                <button
                  onClick={() => release(p.id)}
                  disabled={releasing === p.id}
                  title="Liberar pagamento manualmente"
                  className="ml-1 px-2 py-1 rounded-lg bg-bitcoin/10 border border-bitcoin/30 text-bitcoin text-xs hover:bg-bitcoin/20 disabled:opacity-50 flex-shrink-0"
                >
                  {releasing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Liberar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{pagination.total} pagamentos</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1">{page} / {pagination.pages}</span>
            <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub: Comunicação ─────────────────────────────────────────────────────────

function BotCommunication() {
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState('ativo');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState(false);
  const [singleId, setSingleId] = useState('');
  const [singleText, setSingleText] = useState('');
  const [sending, setSending] = useState(false);
  const [singleDone, setSingleDone] = useState(false);
  const [error, setError] = useState('');

  const sendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcasting(true);
    setError('');
    try {
      await api.post('/admin/bot/broadcast', { text: broadcastText.trim(), status_filter: broadcastFilter });
      setBroadcastDone(true);
      setBroadcastText('');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao enviar broadcast');
    } finally {
      setBroadcasting(false);
    }
  };

  const sendSingle = async () => {
    if (!singleId.trim() || !singleText.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post('/admin/bot/message', { telegram_id: singleId.trim(), text: singleText.trim() });
      setSingleDone(true);
      setSingleText('');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
        <h4 className="font-medium text-gray-200 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-bitcoin" /> Broadcast
        </h4>
        <textarea
          value={broadcastText}
          onChange={e => { setBroadcastText(e.target.value); setBroadcastDone(false); }}
          rows={4}
          placeholder="Mensagem para todos os usuários (suporta Markdown)"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
        />
        <div className="flex gap-3 items-center">
          <select
            value={broadcastFilter}
            onChange={e => setBroadcastFilter(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="ativo">Apenas ativos</option>
            <option value="bloqueado">Apenas bloqueados</option>
          </select>
          <button
            onClick={sendBroadcast}
            disabled={broadcasting || !broadcastText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bitcoin/10 border border-bitcoin/30 text-bitcoin text-sm hover:bg-bitcoin/20 disabled:opacity-50"
          >
            {broadcasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar broadcast
          </button>
        </div>
        {broadcastDone && (
          <p className="text-sm text-green-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Broadcast iniciado em background
          </p>
        )}
      </div>

      <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
        <h4 className="font-medium text-gray-200 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-400" /> Mensagem individual
        </h4>
        <input
          value={singleId}
          onChange={e => { setSingleId(e.target.value); setSingleDone(false); }}
          placeholder="Telegram ID do usuário"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
        <textarea
          value={singleText}
          onChange={e => { setSingleText(e.target.value); setSingleDone(false); }}
          rows={3}
          placeholder="Texto da mensagem (suporta Markdown)"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
        />
        <button
          onClick={sendSingle}
          disabled={sending || !singleId.trim() || !singleText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm hover:bg-blue-500/20 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Enviar mensagem
        </button>
        {singleDone && (
          <p className="text-sm text-green-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Mensagem enviada
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub: Configurações ───────────────────────────────────────────────────────

function BotConfig() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/bot/config')
      .then(r => setConfig(r.data))
      .catch(() => setError('Erro ao carregar configurações'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-bitcoin" /></div>;
  if (error) return <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>;
  if (!config) return null;

  const rows = [
    { label: 'Limite novo usuário', value: `R$ ${config.LIMITE_NOVO_USUARIO}` },
    { label: `Limite após ${config.DIAS_LIMITE_NOVO} dias`, value: `R$ ${config.LIMITE_APOS_7_DIAS}` },
    { label: 'Dias para novo limite', value: `${config.DIAS_LIMITE_NOVO} dias` },
    { label: 'Taxa percentual', value: `${config.BOT_FEE_PERCENT}%` },
    { label: 'Taxa fixa', value: `R$ ${config.BOT_FEE_FIXED}` },
    { label: 'Swapverse configurado', value: config.swapverseConfigured ? '✅ Sim' : '❌ Não' },
    { label: 'Bot configurado', value: config.botConfigured ? '✅ Sim' : '❌ Não' },
  ];

  return (
    <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-bitcoin" />
        <h4 className="font-medium text-gray-200">Configurações do Bot (variáveis de ambiente)</h4>
      </div>
      <p className="text-xs text-gray-500">Para alterar, edite o arquivo .env do bot e reinicie com: <code className="bg-gray-700 px-1 rounded">pm2 restart pagdepix-bot --update-env</code></p>
      <div className="divide-y divide-gray-700">
        {rows.map(r => (
          <div key={r.label} className="py-2 flex justify-between text-sm">
            <span className="text-gray-400">{r.label}</span>
            <span className="text-white font-medium">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Principal ────────────────────────────────────────────────────────────────

const TABS: { id: BotTab; label: string; icon: any }[] = [
  { id: 'metricas',       label: 'Métricas',       icon: BarChart2  },
  { id: 'usuarios',       label: 'Usuários',        icon: Users      },
  { id: 'pagamentos',     label: 'Pagamentos',      icon: CreditCard },
  { id: 'comunicacao',    label: 'Comunicação',     icon: Megaphone  },
  { id: 'configuracoes',  label: 'Configurações',   icon: Settings   },
];

export default function AdminBot() {
  const [tab, setTab] = useState<BotTab>('metricas');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="w-5 h-5 text-bitcoin" />
        <h2 className="text-lg font-semibold text-white">Bot Telegram</h2>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-gray-800 pb-3">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-bitcoin/10 border border-bitcoin/30 text-bitcoin'
                : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'metricas'      && <BotMetrics />}
      {tab === 'usuarios'      && <BotUsers />}
      {tab === 'pagamentos'    && <BotPayments />}
      {tab === 'comunicacao'   && <BotCommunication />}
      {tab === 'configuracoes' && <BotConfig />}
    </div>
  );
}

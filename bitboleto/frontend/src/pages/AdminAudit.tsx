/**
 * Auditoria e logs do Admin – Histórico de eventos e alterações administrativas.
 */

import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, Search, Calendar, Filter } from 'lucide-react';
import api from '../services/api';

interface Log {
  id: string;
  action: string;
  details: string | null;
  ip: string;
  userAgent: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; telegram: string } | null;
}

export default function AdminAudit() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchAction, setSearchAction] = useState('');

  const loadLogs = async (p = 1) => {
    setLoading(true);
    try {
      const params: { page: number; limit: number; action?: string } = {
        page: p,
        limit: 50,
      };
      if (searchAction.trim()) params.action = searchAction.trim();
      const { data } = await api.get<{ logs: Log[]; pagination: { totalPages: number } }>('/admin/logs', {
        params,
      });
      setLogs(data.logs);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [searchAction]);

  const formatAction = (action: string) => {
    const map: Record<string, string> = {
      admin_user_made_affiliate: 'Usuário tornado afiliado',
      admin_verify_email: 'Verificação de email',
      admin_verify_telegram: 'Verificação de Telegram',
      wallet_config_updated: 'Configuração de carteira atualizada',
      login: 'Login',
      boleto_approved: 'Boleto aprovado',
      boleto_rejected: 'Boleto rejeitado',
    };
    return map[action] || action.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-bitcoin/10 rounded-xl">
          <ClipboardList className="w-6 h-6 text-bitcoin" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Auditoria e logs</h2>
          <p className="text-gray-400 text-sm">
            Histórico de eventos críticos e alterações administrativas
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Filtrar por ação (ex: admin, login, wallet)"
            value={searchAction}
            onChange={(e) => setSearchAction(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm placeholder-gray-500"
          />
        </div>
        <button
          onClick={() => loadLogs(1)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bitcoin text-black font-medium text-sm hover:opacity-90"
        >
          <Filter className="w-4 h-4" />
          Aplicar
        </button>
      </div>

      {/* Lista de logs */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            Nenhum log encontrado
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-bitcoin/20 text-bitcoin text-xs font-medium">
                    {formatAction(log.action)}
                  </span>
                  <span className="text-gray-500 text-xs flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                {log.user && (
                  <p className="text-sm text-gray-400 mb-1">
                    Usuário: {log.user.name} ({log.user.email})
                  </p>
                )}
                {log.details && (
                  <pre className="text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap break-words mt-1">
                    {log.details}
                  </pre>
                )}
                <p className="text-xs text-gray-600 mt-1">IP: {log.ip}</p>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-gray-700">
            <button
              onClick={() => loadLogs(page - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="px-4 py-2 text-gray-400 text-sm">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => loadLogs(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

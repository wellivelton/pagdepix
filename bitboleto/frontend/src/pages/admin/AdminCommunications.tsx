import { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Eye,
  Bell,
} from 'lucide-react';
import api from '../../services/api';
import AdminPushManager from './AdminPushManager';
import AdminEmailCampaigns from './AdminEmailCampaigns';

interface Notification {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  type: string;
  targetType: string;
  targetRoles: string[];
  targetUserIds: string[];
  isActive: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  viewCount?: number;
  clickCount?: number;
}

const TARGET_LABELS: Record<string, string> = {
  ALL: 'Todos',
  ROLES: 'Por role',
  USERS: 'Usuários específicos',
};
const ROLE_LABELS: Record<string, string> = {
  USER: 'Usuário',
  AFFILIATE: 'Afiliado',
  COMMERCE: 'Comerciante',
};

export default function AdminCommunications() {
  const [commTab, setCommTab] = useState<'inapp' | 'push' | 'email'>('inapp');
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [metricsId, setMetricsId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ viewCount: number; clickCount: number; conversionRate: number } | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);

  const [form, setForm] = useState({
    title: '',
    body: '',
    imageUrl: '',
    imageFile: null as File | null,
    buttonText: '',
    buttonUrl: '',
    type: 'POPUP' as 'POPUP' | 'BANNER',
    targetType: 'ALL' as 'ALL' | 'ROLES' | 'USERS',
    targetRoles: [] as string[],
    targetUserIds: [] as string[],
    isActive: true,
    startsAt: '',
    expiresAt: '',
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const loadList = () => {
    setLoading(true);
    api
      .get('/admin/notifications', { params: { page, limit: 20 } })
      .then(({ data }) => {
        setList(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  const loadUsers = () => {
    api.get('/admin/users').then(({ data }) => {
      setUsers((data.users || []).slice(0, 200).map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
    }).catch(() => {});
  };

  useEffect(() => { loadList(); }, [page]);
  useEffect(() => { if (modalOpen) loadUsers(); }, [modalOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      body: '',
      imageUrl: '',
      imageFile: null,
      buttonText: '',
      buttonUrl: '',
      type: 'POPUP',
      targetType: 'ALL',
      targetRoles: [],
      targetUserIds: [],
      isActive: true,
      startsAt: '',
      expiresAt: '',
    });
    setModalOpen(true);
  };

  const openEdit = (n: Notification) => {
    setEditingId(n.id);
    setForm({
      title: n.title,
      body: n.body,
      imageUrl: n.imageUrl || '',
      imageFile: null,
      buttonText: n.buttonText || '',
      buttonUrl: n.buttonUrl || '',
      type: n.type === 'BANNER' ? 'BANNER' : 'POPUP',
      targetType: (n.targetType || 'ALL') as 'ALL' | 'ROLES' | 'USERS',
      targetRoles: n.targetRoles || [],
      targetUserIds: n.targetUserIds || [],
      isActive: n.isActive,
      startsAt: n.startsAt ? n.startsAt.slice(0, 16) : '',
      expiresAt: n.expiresAt ? n.expiresAt.slice(0, 16) : '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('body', form.body);
    fd.append('type', form.type);
    fd.append('targetType', form.targetType);
    fd.append('targetRoles', JSON.stringify(form.targetRoles));
    fd.append('targetUserIds', JSON.stringify(form.targetUserIds));
    fd.append('isActive', String(form.isActive));
    if (form.buttonText) fd.append('buttonText', form.buttonText);
    if (form.buttonUrl) fd.append('buttonUrl', form.buttonUrl);
    if (form.imageUrl && !form.imageFile) fd.append('imageUrl', form.imageUrl);
    if (form.imageFile) fd.append('image', form.imageFile);
    if (form.startsAt) fd.append('startsAt', new Date(form.startsAt).toISOString());
    if (form.expiresAt) fd.append('expiresAt', new Date(form.expiresAt).toISOString());

    const url = editingId ? `/admin/notifications/${editingId}` : '/admin/notifications';
    const method = editingId ? 'put' : 'post';

    try {
      await api[method](url, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setModalOpen(false);
      loadList();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta notificação?')) return;
    setDeleteLoading(id);
    try {
      await api.delete(`/admin/notifications/${id}`);
      loadList();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir');
    } finally {
      setDeleteLoading(null);
    }
  };

  const showMetrics = async (id: string) => {
    setMetricsId(id);
    setMetrics(null);
    try {
      const { data } = await api.get(`/admin/notifications/${id}/metrics`);
      setMetrics(data);
    } catch {
      setMetrics(null);
    }
  };

  const toggleRole = (r: string) => {
    setForm((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(r)
        ? prev.targetRoles.filter((x) => x !== r)
        : [...prev.targetRoles, r],
    }));
  };

  const addUser = (id: string) => {
    if (!form.targetUserIds.includes(id)) {
      setForm((prev) => ({ ...prev, targetUserIds: [...prev.targetUserIds, id] }));
    }
  };

  const removeUser = (id: string) => {
    setForm((prev) => ({ ...prev, targetUserIds: prev.targetUserIds.filter((x) => x !== id) }));
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs: In-App vs Push */}
      <div className="flex gap-2">
        <button
          onClick={() => setCommTab('inapp')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${commTab === 'inapp' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          <Megaphone className="w-4 h-4" />
          Notificações In-App
        </button>
        <button
          onClick={() => setCommTab('push')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${commTab === 'push' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          <Bell className="w-4 h-4" />
          Push Notifications
        </button>
        <button
          onClick={() => setCommTab('email')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${commTab === 'email' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          <Megaphone className="w-4 h-4" />
          Email Marketing
        </button>
      </div>

      {commTab === 'push' && <AdminPushManager />}

      {commTab === 'email' && <AdminEmailCampaigns />}

      {commTab === 'inapp' && <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Comunicações Internas</h2>
          <p className="text-gray-400 text-sm">Pop-ups e banners para notificar usuários</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bitcoin/20 text-bitcoin border border-bitcoin/40 hover:bg-bitcoin/30 font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Nova notificação
        </button>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Megaphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma notificação criada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-3 text-gray-400 font-medium">Título</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Público</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Métricas</th>
                  <th className="text-right p-3 text-gray-400 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.id} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                    <td className="p-3 text-white">{n.title}</td>
                    <td className="p-3 text-gray-300">{n.type}</td>
                    <td className="p-3 text-gray-300">
                      {TARGET_LABELS[n.targetType] || n.targetType}
                      {n.targetType === 'ROLES' && n.targetRoles?.length > 0 && (
                        <span className="text-xs text-gray-500 ml-1">({n.targetRoles.map((r) => ROLE_LABELS[r] || r).join(', ')})</span>
                      )}
                      {n.targetType === 'USERS' && n.targetUserIds?.length > 0 && (
                        <span className="text-xs text-gray-500 ml-1">({n.targetUserIds.length} usuários)</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${n.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'}`}>
                        {n.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => showMetrics(n.id)}
                        className="text-bitcoin hover:underline text-xs flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        {n.viewCount ?? 0} views · {n.clickCount ?? 0} cliques
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => openEdit(n)} className="p-1.5 text-gray-400 hover:text-white rounded">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={deleteLoading === n.id}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded ml-1"
                      >
                        {deleteLoading === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-3 border-t border-gray-700">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="py-1 text-gray-400 text-sm">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {metricsId && metrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setMetricsId(null)}>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-700 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Métricas</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Visualizações</span>
                <span className="text-white">{metrics.viewCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cliques</span>
                <span className="text-white">{metrics.clickCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Taxa de conversão</span>
                <span className="text-bitcoin">{metrics.conversionRate}%</span>
              </div>
            </div>
            <button onClick={() => setMetricsId(null)} className="mt-4 w-full py-2 rounded-lg bg-gray-700 text-white">
              Fechar
            </button>
          </div>
        </div>
      )}

      {commTab === 'inapp' && modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">{editingId ? 'Editar' : 'Nova'} notificação</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Corpo *</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">URL da imagem (ou upload)</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white mb-1"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setForm((p) => ({ ...p, imageFile: e.target.files?.[0] || null }))}
                  className="text-gray-400 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Texto do botão</label>
                  <input
                    type="text"
                    value={form.buttonText}
                    onChange={(e) => setForm((p) => ({ ...p, buttonText: e.target.value }))}
                    placeholder="Ex: Entrar no grupo"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">URL do botão</label>
                  <input
                    type="url"
                    value={form.buttonUrl}
                    onChange={(e) => setForm((p) => ({ ...p, buttonUrl: e.target.value }))}
                    placeholder="https://t.me/..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as 'POPUP' | 'BANNER' }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                >
                  <option value="POPUP">Pop-up</option>
                  <option value="BANNER">Banner</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Público-alvo</label>
                <select
                  value={form.targetType}
                  onChange={(e) => setForm((p) => ({ ...p, targetType: e.target.value as 'ALL' | 'ROLES' | 'USERS' }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                >
                  <option value="ALL">Todos os usuários</option>
                  <option value="ROLES">Por role (USER, AFFILIATE, COMMERCE)</option>
                  <option value="USERS">Usuários específicos</option>
                </select>
              </div>
              {form.targetType === 'ROLES' && (
                <div className="flex gap-2 flex-wrap">
                  {['USER', 'AFFILIATE', 'COMMERCE'].map((r) => (
                    <label key={r} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.targetRoles.includes(r)}
                        onChange={() => toggleRole(r)}
                      />
                      <span className="text-gray-300">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.targetType === 'USERS' && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Adicione usuários pela busca abaixo</p>
                  <select
                    onChange={(e) => { const v = e.target.value; if (v) addUser(v); e.target.value = ''; }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                  >
                    <option value="">Selecione um usuário...</option>
                    {users.filter((u) => !form.targetUserIds.includes(u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  <div className="mt-2 space-y-1">
                    {form.targetUserIds.map((id) => {
                      const u = users.find((x) => x.id === id);
                      return (
                        <div key={id} className="flex items-center justify-between py-1 px-2 bg-gray-800 rounded">
                          <span className="text-gray-300 text-sm">{u?.name || id}</span>
                          <button type="button" onClick={() => removeUser(id)} className="text-red-400 hover:text-red-300">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Início (opcional)</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Expira (opcional)</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                <span className="text-gray-300">Ativo</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-gray-700 text-white">
                  Cancelar
                </button>
                <button type="submit" disabled={submitLoading} className="px-4 py-2 rounded-lg bg-bitcoin text-black font-medium disabled:opacity-50">
                  {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

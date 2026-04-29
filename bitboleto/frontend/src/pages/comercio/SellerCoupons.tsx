import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Tag } from 'lucide-react';

export default function SellerCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discountPercent: '',
    productId: '',
    maxUsage: '',
    expiresAt: '',
  });
  const [products, setProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/marketplace/seller/coupons')
      .then(({ data }) => setCoupons(Array.isArray(data) ? data : []))
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/marketplace/seller/products')
      .then(({ data }) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = form.code.trim().toUpperCase();
    const discount = parseFloat(form.discountPercent);
    if (!code || code.length < 3) {
      setError('Código deve ter no mínimo 3 caracteres');
      return;
    }
    if (isNaN(discount) || discount <= 0 || discount > 100) {
      setError('Desconto deve ser entre 0.01 e 100');
      return;
    }
    setSubmitting(true);
    const payload: any = { code, discountPercent: discount };
    if (form.productId) payload.productId = form.productId;
    if (form.maxUsage) payload.maxUsage = parseInt(form.maxUsage, 10);
    if (form.expiresAt) payload.expiresAt = form.expiresAt;
    api.post('/marketplace/seller/coupon', payload)
      .then(() => {
        load();
        setShowForm(false);
        setForm({ code: '', discountPercent: '', productId: '', maxUsage: '', expiresAt: '' });
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao criar cupom'))
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse space-y-4">
        <div className="h-32 bg-gray-800 rounded-xl" />
        <div className="h-48 bg-gray-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Tag className="w-5 h-5 text-bitcoin" />
          Cupons de desconto
        </h1>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium transition"
        >
          {showForm ? 'Fechar' : 'Criar Cupom'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Novo Cupom</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Código *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EX: PROMO20"
                maxLength={50}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Desconto (%) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                placeholder="20"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Produto (opcional)</label>
              <select
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white"
              >
                <option value="">Todos os produtos</option>
                {products.filter((p: any) => p.status === 'APPROVED').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Uso máximo (opcional)</label>
                <input
                  type="number"
                  min="1"
                  value={form.maxUsage}
                  onChange={(e) => setForm({ ...form, maxUsage: e.target.value })}
                  placeholder="Ilimitado"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Validade (opcional)</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium disabled:opacity-50 transition"
            >
              {submitting ? 'Criando...' : 'Criar Cupom'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        {coupons.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Nenhum cupom cadastrado. Crie um para oferecer descontos aos clientes.
          </div>
        ) : (
          <ul className="divide-y divide-gray-700/50">
            {coupons.map((c) => (
              <li key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{c.code}</p>
                  <p className="text-sm text-gray-400">
                    {c.discountPercent}% de desconto
                    {c.product ? ` · ${c.product.title}` : ' · Todos os produtos'}
                    {c.usageCount != null && ` · Usado ${c.usageCount}x`}
                    {c.expiresAt && ` · Vence em ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <span className={`text-sm px-2 py-1 rounded ${c.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/30 text-gray-500'}`}>
                  {c.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { ArrowLeft, Upload, Plus, Trash2, AlertTriangle, MapPin } from 'lucide-react';
import {
  CATEGORIES_DIGITAL,
  CATEGORIES_LOCAL,
  DELIVERY_TYPES_DIGITAL,
  PRICE_MIN,
  PRICE_MAX,
  COVER_MAX_SIZE,
  COVER_ALLOWED_TYPES,
  COVER_FORMATS_LABEL,
} from '../../constants/productForm';

type DeliveryZone = {
  id: string;
  name: string;
  type: 'neighborhood' | 'region' | 'city';
  price: string;
};

const ZONE_TYPE_LABELS = {
  neighborhood: 'Bairro',
  region: 'Região',
  city: 'Cidade',
} as const;

export default function CreateProduct() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Product type: 'digital' | 'local'
  const [productType, setProductType] = useState<'digital' | 'local'>('digital');

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'EBOOK',
    priceInDepix: '',
    deliveryType: 'FILE',
    deliveryLink: '',
    allowAffiliates: false,
    affiliateCommissionPercent: '0',
    isReusable: true,
    isAdultContent: false,
    localDeliveryMode: 'CONTACT' as 'CONTACT' | 'ZONE_PRICE',
    localDeliveryCep: '',
  });

  const [localZones, setLocalZones] = useState<DeliveryZone[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverFileError, setCoverFileError] = useState('');

  const handleProductTypeChange = (type: 'digital' | 'local') => {
    setProductType(type);
    if (type === 'local') {
      setForm((f) => ({
        ...f,
        deliveryType: 'LOCAL',
        category: 'FOOD',
      }));
    } else {
      setForm((f) => ({
        ...f,
        deliveryType: 'FILE',
        category: 'EBOOK',
      }));
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCoverFileError('');
    if (!file) { setCoverFile(null); return; }
    if (file.size > COVER_MAX_SIZE) {
      setCoverFileError(`Imagem excede 1MB. Tamanho: ${(file.size / 1024).toFixed(0)}KB.`);
      setCoverFile(null); e.target.value = ''; return;
    }
    if (!COVER_ALLOWED_TYPES.includes(file.type)) {
      setCoverFileError(`Formato inválido. Use ${COVER_FORMATS_LABEL}.`);
      setCoverFile(null); e.target.value = ''; return;
    }
    setCoverFile(file);
  };

  const addZone = () => {
    setLocalZones((z) => [...z, { id: crypto.randomUUID(), name: '', type: 'neighborhood', price: '' }]);
  };

  const updateZone = (id: string, field: keyof DeliveryZone, value: string) => {
    setLocalZones((z) => z.map((zone) => zone.id === id ? { ...zone, [field]: value } : zone));
  };

  const removeZone = (id: string) => {
    setLocalZones((z) => z.filter((zone) => zone.id !== id));
  };

  const parseApiError = (err: any): string => {
    const msg = err?.response?.data?.error;
    if (typeof msg === 'string') return msg;
    if (err?.response?.status === 413) return 'Imagem muito grande. Máximo 1MB.';
    if (err?.message?.includes('Network Error') || err?.code === 'ERR_NETWORK') return 'Erro de conexão. Verifique sua internet.';
    return 'Erro ao criar produto. Tente novamente.';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setCoverFileError('');

    if (!form.title.trim()) { setError('Título é obrigatório.'); return; }
    if (!form.description.trim()) { setError('Descrição é obrigatória.'); return; }

    const price = parseFloat(form.priceInDepix);
    if (isNaN(price) || price < PRICE_MIN) { setError('Preço inválido.'); return; }
    if (price > PRICE_MAX) { setError(`Preço máximo: ${PRICE_MAX.toLocaleString('pt-BR')} DEPIX.`); return; }

    if (form.deliveryType === 'LINK') {
      if (!form.deliveryLink.trim()) { setError('Link de entrega obrigatório para tipo "Link externo".'); return; }
      try { new URL(form.deliveryLink.trim()); } catch { setError('URL de entrega inválida.'); return; }
    }

    if (productType === 'local') {
      if (!form.localDeliveryCep.trim() || form.localDeliveryCep.replace(/\D/g, '').length !== 8) {
        setError('CEP de origem obrigatório (8 dígitos).'); return;
      }
      if (form.localDeliveryMode === 'ZONE_PRICE' && localZones.length === 0) {
        setError('Adicione pelo menos uma zona de entrega.'); return;
      }
    }

    if (coverFile && coverFile.size > COVER_MAX_SIZE) { setCoverFileError('Imagem excede 1MB.'); return; }

    setLoading(true);
    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('description', form.description.trim());
    fd.append('category', form.category);
    fd.append('priceInDepix', String(price));
    fd.append('deliveryType', form.deliveryType);
    if (form.deliveryType === 'LINK') fd.append('deliveryLink', form.deliveryLink.trim());
    fd.append('allowAffiliates', String(form.allowAffiliates));
    fd.append('affiliateCommissionPercent', form.affiliateCommissionPercent || '0');
    fd.append('isReusable', String(form.isReusable));
    fd.append('isAdultContent', String(form.isAdultContent));
    if (productType === 'local') {
      fd.append('localDeliveryCep', form.localDeliveryCep.replace(/\D/g, ''));
      fd.append('localDeliveryMode', form.localDeliveryMode);
      if (form.localDeliveryMode === 'ZONE_PRICE') {
        fd.append('localDeliveryZones', JSON.stringify(localZones.map(({ id: _, ...z }) => ({ ...z, price: parseFloat(z.price) || 0 }))));
      }
    }
    if (coverFile) fd.append('cover', coverFile);

    api.post('/marketplace/product', fd)
      .then(() => navigate('/comercio/loja/produtos'))
      .catch((err) => setError(parseApiError(err)))
      .finally(() => setLoading(false));
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition';
  const categories = productType === 'local' ? CATEGORIES_LOCAL : CATEGORIES_DIGITAL;

  return (
    <div className="max-w-2xl animate-fade-in">
      <button type="button" onClick={() => navigate('/comercio/loja/produtos')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar aos produtos
      </button>

      <form onSubmit={handleSubmit} className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6 md:p-8 space-y-6">
        <h2 className="text-xl font-bold text-white">Cadastrar produto</h2>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        {/* Tipo de produto */}
        <div>
          <label className="block text-gray-400 text-sm mb-2">Tipo de produto *</label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => handleProductTypeChange('digital')}
              className={`p-4 rounded-xl border-2 text-left transition ${productType === 'digital' ? 'border-bitcoin bg-bitcoin/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
              <div className="text-2xl mb-1">💻</div>
              <p className="font-semibold text-white text-sm">Digital</p>
              <p className="text-xs text-gray-400">E-book, curso, software, link</p>
            </button>
            <button type="button" onClick={() => handleProductTypeChange('local')}
              className={`p-4 rounded-xl border-2 text-left transition ${productType === 'local' ? 'border-bitcoin bg-bitcoin/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
              <div className="text-2xl mb-1">📦</div>
              <p className="font-semibold text-white text-sm">Físico Local</p>
              <p className="text-xs text-gray-400">Entrega feita pelo comerciante</p>
            </button>
          </div>
        </div>

        {/* Digital subtype */}
        {productType === 'digital' && (
          <div>
            <label className="block text-gray-400 text-sm mb-2">Subtipo do produto digital</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setForm((f) => ({ ...f, isReusable: true }))}
                className={`p-3 rounded-xl border-2 text-left transition ${form.isReusable ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
                <p className="font-semibold text-white text-sm">🔁 Reutilizável</p>
                <p className="text-xs text-gray-400">Mesmo item vendido N vezes</p>
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, isReusable: false }))}
                className={`p-3 rounded-xl border-2 text-left transition ${!form.isReusable ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
                <p className="font-semibold text-white text-sm">🔐 Estoque finito</p>
                <p className="text-xs text-gray-400">Um item único por venda</p>
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-gray-400 text-sm mb-1">Título *</label>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Curso de React Avançado" className={inputCls} maxLength={200} />
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1">Descrição *</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descreva o produto..." rows={4} className={`${inputCls} resize-none`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Categoria *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Preço (DEPIX) *</label>
            <input type="number" step="0.01" min="0" max={PRICE_MAX} value={form.priceInDepix}
              onChange={(e) => setForm({ ...form, priceInDepix: e.target.value })}
              placeholder="0.00 para gratuito" className={inputCls} />
            <p className="text-xs text-gray-500 mt-1">Mínimo: 0 (gratuito)</p>
          </div>
        </div>

        {/* Delivery type — only for digital */}
        {productType === 'digital' && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Tipo de entrega *</label>
            <select value={form.deliveryType}
              onChange={(e) => setForm({ ...form, deliveryType: e.target.value, deliveryLink: e.target.value === 'LINK' ? form.deliveryLink : '' })}
              className={inputCls}>
              {DELIVERY_TYPES_DIGITAL.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {form.deliveryType === 'FILE' && <p className="text-xs text-gray-500 mt-1">Faça upload dos arquivos após criar o produto.</p>}
            {form.deliveryType === 'CODE' && <p className="text-xs text-gray-500 mt-1">Adicione os códigos em massa após criar o produto.</p>}
          </div>
        )}

        {form.deliveryType === 'LINK' && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Link de entrega *</label>
            <input type="url" value={form.deliveryLink} onChange={(e) => setForm({ ...form, deliveryLink: e.target.value })}
              placeholder="https://..." className={inputCls} />
          </div>
        )}

        {/* Local delivery fields */}
        {productType === 'local' && (
          <div className="space-y-4 p-4 bg-gray-900/30 rounded-xl border border-gray-700/50">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <MapPin className="w-4 h-4 text-bitcoin" />
              <span className="font-medium">Entrega física local</span>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-1">CEP de origem *</label>
              <input type="text" value={form.localDeliveryCep}
                onChange={(e) => setForm({ ...form, localDeliveryCep: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                placeholder="00000000" maxLength={8} className={inputCls} />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Modo de entrega *</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setForm((f) => ({ ...f, localDeliveryMode: 'CONTACT' }))}
                  className={`p-3 rounded-xl border-2 text-left transition ${form.localDeliveryMode === 'CONTACT' ? 'border-bitcoin bg-bitcoin/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
                  <p className="font-medium text-white text-xs">Combinar com cliente</p>
                  <p className="text-xs text-gray-500 mt-0.5">O cliente entra em contato</p>
                </button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, localDeliveryMode: 'ZONE_PRICE' }))}
                  className={`p-3 rounded-xl border-2 text-left transition ${form.localDeliveryMode === 'ZONE_PRICE' ? 'border-bitcoin bg-bitcoin/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
                  <p className="font-medium text-white text-xs">Frete por zona</p>
                  <p className="text-xs text-gray-500 mt-0.5">Preço por bairro/região</p>
                </button>
              </div>
            </div>

            {form.localDeliveryMode === 'ZONE_PRICE' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-400">Zonas de entrega *</label>
                  <button type="button" onClick={addZone}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg transition">
                    <Plus className="w-3 h-3" /> Adicionar zona
                  </button>
                </div>
                {localZones.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">Nenhuma zona adicionada</p>
                )}
                {localZones.map((zone) => (
                  <div key={zone.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                    <input type="text" value={zone.name} onChange={(e) => updateZone(zone.id, 'name', e.target.value)}
                      placeholder="Nome da zona" className="px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition" />
                    <select value={zone.type} onChange={(e) => updateZone(zone.id, 'type', e.target.value)}
                      className="px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-bitcoin/50 transition">
                      {Object.entries(ZONE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="number" step="0.01" min="0" value={zone.price} onChange={(e) => updateZone(zone.id, 'price', e.target.value)}
                      placeholder="Preço" className="w-20 px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin/50 transition" />
                    <button type="button" onClick={() => removeZone(zone.id)} className="p-1.5 text-red-400 hover:text-red-300 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cover image */}
        <div>
          <label className="block text-gray-400 text-sm mb-1">Capa (opcional)</label>
          <p className="text-xs text-gray-500 mb-2">Máximo 1MB. Formatos: {COVER_FORMATS_LABEL}.</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-bitcoin/50 cursor-pointer transition">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Escolher imagem</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleCoverChange} />
              </label>
              {coverFile && <span className="text-sm text-gray-500 truncate max-w-[180px]">{coverFile.name} ({(coverFile.size / 1024).toFixed(0)}KB)</span>}
            </div>
            {coverFileError && <p className="text-sm text-red-400">{coverFileError}</p>}
          </div>
        </div>

        {/* Adult content */}
        <div className={`flex items-start gap-3 p-3 rounded-xl border ${form.isAdultContent ? 'border-red-500/40 bg-red-500/5' : 'border-gray-700 bg-transparent'}`}>
          <input type="checkbox" id="isAdultContent" checked={form.isAdultContent}
            onChange={(e) => setForm({ ...form, isAdultContent: e.target.checked })}
            className="mt-0.5 rounded border-gray-600 bg-gray-800 text-red-500 focus:ring-red-500/50" />
          <div>
            <label htmlFor="isAdultContent" className="text-sm text-gray-300 font-medium cursor-pointer">Conteúdo adulto (+18)</label>
            {form.isAdultContent && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-red-400">
                <AlertTriangle className="w-3 h-3" />
                <span>Produto marcado como +18. Exige verificação de idade do comprador.</span>
              </div>
            )}
          </div>
        </div>

        {/* Affiliates */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="allowAffiliates" checked={form.allowAffiliates}
            onChange={(e) => setForm({ ...form, allowAffiliates: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-bitcoin focus:ring-bitcoin/50" />
          <label htmlFor="allowAffiliates" className="text-sm text-gray-400">Permitir afiliados</label>
        </div>

        {form.allowAffiliates && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Comissão afiliado (%)</label>
            <input type="number" step="0.01" min="0" max="100" value={form.affiliateCommissionPercent}
              onChange={(e) => setForm({ ...form, affiliateCommissionPercent: e.target.value })}
              className="w-full max-w-[120px] px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition" />
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold disabled:opacity-50 transition">
            {loading ? 'Salvando rascunho...' : 'Salvar como rascunho'}
          </button>
          <button type="button" onClick={() => navigate('/comercio/loja/produtos')}
            className="px-6 py-2.5 rounded-xl bg-gray-700/50 hover:bg-gray-700 text-white font-medium transition">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

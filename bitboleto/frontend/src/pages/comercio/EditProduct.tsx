import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { ArrowLeft, Upload, FileText, Plus, Trash2, AlertTriangle, MapPin } from 'lucide-react';
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

export default function EditProduct() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
  const [codesText, setCodesText] = useState('');
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesMessage, setCodesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [productFiles, setProductFiles] = useState<{ id: string; originalFilename: string; filename: string; fileSize: number | string }[]>([]);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [filesUploadLoading, setFilesUploadLoading] = useState(false);
  const [filesUploadError, setFilesUploadError] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [adminAdjustmentRequest, setAdminAdjustmentRequest] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const isLocal = form.deliveryType === 'LOCAL';

  useEffect(() => {
    if (!productId) return;
    api.get('/marketplace/seller/products')
      .then(({ data }) => {
        const p = (data || []).find((x: any) => x.id === productId);
        if (p) {
          setProductFiles(p.files || []);
          const isLocalProduct = p.deliveryType === 'LOCAL';
          const catOptions = isLocalProduct ? CATEGORIES_LOCAL : CATEGORIES_DIGITAL;
          const catValue = catOptions.some((c) => c.value === p.category) ? p.category : catOptions[0].value;
          setForm({
            title: p.title,
            description: p.description || '',
            category: catValue,
            priceInDepix: String(p.priceInDepix ?? ''),
            deliveryType: p.deliveryType || 'FILE',
            deliveryLink: p.deliveryLink || '',
            allowAffiliates: !!p.allowAffiliates,
            affiliateCommissionPercent: String(p.affiliateCommissionPercent ?? '0'),
            isReusable: p.isReusable !== false,
            isAdultContent: !!p.isAdultContent,
            localDeliveryMode: p.localDeliveryMode === 'ZONE_PRICE' ? 'ZONE_PRICE' : 'CONTACT',
            localDeliveryCep: p.localDeliveryCep || '',
          });
          if (p.localDeliveryZones && Array.isArray(p.localDeliveryZones)) {
            setLocalZones(p.localDeliveryZones.map((z: any) => ({
              id: crypto.randomUUID(),
              name: z.name || '',
              type: z.type || 'neighborhood',
              price: String(z.price ?? ''),
            })));
          }
          setProductStatus(p.status || '');
          setAdminAdjustmentRequest(p.adminAdjustmentRequest || null);
        } else {
          setError('Produto não encontrado');
        }
      })
      .catch(() => setError('Erro ao carregar produto'))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCoverFileError('');
    if (!file) { setCoverFile(null); return; }
    if (file.size > COVER_MAX_SIZE) { setCoverFileError(`Imagem excede 1MB.`); setCoverFile(null); e.target.value = ''; return; }
    if (!COVER_ALLOWED_TYPES.includes(file.type)) { setCoverFileError(`Formato inválido. Use ${COVER_FORMATS_LABEL}.`); setCoverFile(null); e.target.value = ''; return; }
    setCoverFile(file);
  };

  const addZone = () => setLocalZones((z) => [...z, { id: crypto.randomUUID(), name: '', type: 'neighborhood', price: '' }]);
  const updateZone = (id: string, field: keyof DeliveryZone, value: string) => setLocalZones((z) => z.map((zone) => zone.id === id ? { ...zone, [field]: value } : zone));
  const removeZone = (id: string) => setLocalZones((z) => z.filter((zone) => zone.id !== id));

  const parseApiError = (err: any): string => {
    const msg = err?.response?.data?.error;
    if (typeof msg === 'string') return msg;
    if (err?.response?.status === 413) return 'Imagem muito grande. Máximo 1MB.';
    if (err?.message?.includes('Network Error') || err?.code === 'ERR_NETWORK') return 'Erro de conexão.';
    return 'Erro ao atualizar produto. Tente novamente.';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    setError(''); setCoverFileError('');

    if (!form.title.trim()) { setError('Título é obrigatório.'); return; }
    if (!form.description.trim()) { setError('Descrição é obrigatória.'); return; }
    const price = parseFloat(form.priceInDepix);
    if (isNaN(price) || price < PRICE_MIN) { setError('Preço inválido.'); return; }
    if (price > PRICE_MAX) { setError(`Preço máximo: ${PRICE_MAX.toLocaleString('pt-BR')} DEPIX.`); return; }
    if (form.deliveryType === 'LINK') {
      if (!form.deliveryLink.trim()) { setError('Link de entrega obrigatório.'); return; }
      try { new URL(form.deliveryLink.trim()); } catch { setError('URL de entrega inválida.'); return; }
    }
    if (isLocal) {
      if (!form.localDeliveryCep.trim() || form.localDeliveryCep.replace(/\D/g, '').length !== 8) {
        setError('CEP de origem obrigatório (8 dígitos).'); return;
      }
      if (form.localDeliveryMode === 'ZONE_PRICE' && localZones.length === 0) {
        setError('Adicione pelo menos uma zona de entrega.'); return;
      }
    }
    if (coverFile && coverFile.size > COVER_MAX_SIZE) { setCoverFileError('Imagem excede 1MB.'); return; }

    setSaving(true);
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
    if (isLocal) {
      fd.append('localDeliveryCep', form.localDeliveryCep.replace(/\D/g, ''));
      fd.append('localDeliveryMode', form.localDeliveryMode);
      if (form.localDeliveryMode === 'ZONE_PRICE') {
        fd.append('localDeliveryZones', JSON.stringify(localZones.map(({ id: _, ...z }) => ({ ...z, price: parseFloat(z.price) || 0 }))));
      }
    }
    if (coverFile) fd.append('cover', coverFile);

    api.put(`/marketplace/product/${productId}`, fd)
      .then(() => navigate('/comercio/loja/produtos'))
      .catch((err) => setError(parseApiError(err)))
      .finally(() => setSaving(false));
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition';
  const categories = isLocal ? CATEGORIES_LOCAL : CATEGORIES_DIGITAL;

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse">
        <div className="h-8 bg-gray-700/50 rounded w-48 mb-6" />
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 space-y-4">
          <div className="h-10 bg-gray-700/50 rounded" />
          <div className="h-24 bg-gray-700/50 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl animate-fade-in">
      <button type="button" onClick={() => navigate('/comercio/loja/produtos')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar aos produtos
      </button>

      <form onSubmit={handleSubmit} className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Editar produto</h2>
          {isLocal && (
            <span className="px-2.5 py-1 text-xs bg-orange-500/20 text-orange-300 rounded-full font-medium">Físico Local</span>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
        {adminAdjustmentRequest && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
            <strong>Solicitação de ajustes do administrador:</strong>
            <p className="mt-1 whitespace-pre-wrap">{adminAdjustmentRequest}</p>
          </div>
        )}

        {/* Digital subtype */}
        {!isLocal && (
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
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} maxLength={200} />
        </div>

        <div>
          <label className="block text-gray-400 text-sm mb-1">Descrição *</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className={`${inputCls} resize-none`} />
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
              onChange={(e) => setForm({ ...form, priceInDepix: e.target.value })} placeholder="0.00" className={inputCls} />
          </div>
        </div>

        {/* Delivery type — digital only */}
        {!isLocal && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Tipo de entrega *</label>
            <select value={form.deliveryType} onChange={(e) => setForm({ ...form, deliveryType: e.target.value })} className={inputCls}>
              {DELIVERY_TYPES_DIGITAL.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        )}

        {form.deliveryType === 'LINK' && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Link de entrega *</label>
            <input type="url" value={form.deliveryLink} onChange={(e) => setForm({ ...form, deliveryLink: e.target.value })} className={inputCls} />
          </div>
        )}

        {/* File upload for FILE type */}
        {form.deliveryType === 'FILE' && (
          <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700/50">
            <label className="block text-gray-400 text-sm mb-2">Arquivos do produto (PDF, ZIP, etc.)</label>
            <p className="text-xs text-gray-500 mb-3">Os compradores receberão estes arquivos após confirmação do pagamento.</p>
            {productFiles.length > 0 && (
              <ul className="space-y-1 mb-3">
                {productFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <FileText className="w-4 h-4 text-gray-500" />
                    {f.originalFilename || f.filename} ({(Number(f.fileSize) / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-bitcoin/50 cursor-pointer transition w-fit">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Adicionar arquivos</span>
                <input type="file" multiple accept=".pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.mp4,.epub,.mobi" className="hidden"
                  onChange={(e) => { setFilesToUpload((prev) => [...prev, ...Array.from(e.target.files || [])].slice(0, 10)); setFilesUploadError(''); e.target.value = ''; }} />
              </label>
              {filesToUpload.length > 0 && (
                <div className="space-y-1">
                  {filesToUpload.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm text-gray-300">
                      <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                      <button type="button" onClick={() => setFilesToUpload((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 text-xs">Remover</button>
                    </div>
                  ))}
                  <button type="button" disabled={filesUploadLoading}
                    onClick={() => {
                      if (!productId || filesToUpload.length === 0) return;
                      setFilesUploadLoading(true); setFilesUploadError('');
                      const fd = new FormData();
                      filesToUpload.forEach((file) => fd.append('files', file));
                      api.post(`/marketplace/product/${productId}/files`, fd)
                        .then(({ data }) => {
                          setProductFiles((prev) => [...prev, ...(data.files || []).map((x: any) => ({ id: x.id, originalFilename: x.originalFilename || x.filename, filename: x.filename, fileSize: x.fileSize ?? 0 }))]);
                          setFilesToUpload([]);
                        })
                        .catch((err) => setFilesUploadError(err.response?.data?.error || 'Erro ao enviar'))
                        .finally(() => setFilesUploadLoading(false));
                    }}
                    className="px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium disabled:opacity-50 transition">
                    {filesUploadLoading ? 'Enviando...' : `Enviar ${filesToUpload.length} arquivo(s)`}
                  </button>
                </div>
              )}
              {filesUploadError && <p className="text-sm text-red-400">{filesUploadError}</p>}
            </div>
          </div>
        )}

        {/* Code upload for CODE type */}
        {form.deliveryType === 'CODE' && (
          <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700/50">
            <label className="block text-gray-400 text-sm mb-1">Adicionar códigos em massa</label>
            <p className="text-xs text-gray-500 mb-2">Um código por linha. Cada código será entregue a apenas um comprador.</p>
            <textarea value={codesText} onChange={(e) => { setCodesText(e.target.value); setCodesMessage(null); }}
              placeholder={'codigo_001\ncodigo_002'} rows={5}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 font-mono text-sm resize-none" />
            {codesMessage && <p className={`mt-2 text-sm ${codesMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{codesMessage.text}</p>}
            <button type="button" disabled={codesLoading}
              onClick={() => {
                if (!productId) return;
                const lines = codesText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
                if (!lines.length) { setCodesMessage({ type: 'error', text: 'Digite pelo menos um código.' }); return; }
                setCodesLoading(true); setCodesMessage(null);
                api.post(`/marketplace/product/${productId}/codes`, { codes: lines })
                  .then(({ data }) => { setCodesMessage({ type: 'success', text: `${data.created ?? lines.length} código(s) adicionado(s).` }); setCodesText(''); })
                  .catch((err) => setCodesMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao adicionar' }))
                  .finally(() => setCodesLoading(false));
              }}
              className="mt-2 px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium disabled:opacity-50 transition">
              {codesLoading ? 'Adicionando...' : 'Adicionar códigos'}
            </button>
          </div>
        )}

        {/* Local delivery fields */}
        {isLocal && (
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
                {(['CONTACT', 'ZONE_PRICE'] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setForm((f) => ({ ...f, localDeliveryMode: mode }))}
                    className={`p-3 rounded-xl border-2 text-left transition ${form.localDeliveryMode === mode ? 'border-bitcoin bg-bitcoin/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'}`}>
                    <p className="font-medium text-white text-xs">{mode === 'CONTACT' ? 'Combinar com cliente' : 'Frete por zona'}</p>
                  </button>
                ))}
              </div>
            </div>
            {form.localDeliveryMode === 'ZONE_PRICE' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-400">Zonas de entrega *</label>
                  <button type="button" onClick={addZone} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg transition">
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
                {localZones.map((zone) => (
                  <div key={zone.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                    <input type="text" value={zone.name} onChange={(e) => updateZone(zone.id, 'name', e.target.value)}
                      placeholder="Nome da zona" className="px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin/50 transition" />
                    <select value={zone.type} onChange={(e) => updateZone(zone.id, 'type', e.target.value)}
                      className="px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-bitcoin/50 transition">
                      {Object.entries(ZONE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="number" step="0.01" min="0" value={zone.price} onChange={(e) => updateZone(zone.id, 'price', e.target.value)}
                      placeholder="R$" className="w-20 px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin/50 transition" />
                    <button type="button" onClick={() => removeZone(zone.id)} className="p-1.5 text-red-400 hover:text-red-300 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cover */}
        <div>
          <label className="block text-gray-400 text-sm mb-1">Nova capa (opcional)</label>
          <p className="text-xs text-gray-500 mb-2">Formatos: {COVER_FORMATS_LABEL}. Máx. 1MB.</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-bitcoin/50 cursor-pointer transition w-fit">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Trocar imagem</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleCoverChange} />
            </label>
            {coverFile && <span className="text-sm text-gray-500">{coverFile.name}</span>}
            {coverFileError && <p className="text-sm text-red-400">{coverFileError}</p>}
          </div>
        </div>

        {/* Adult content */}
        <div className={`flex items-start gap-3 p-3 rounded-xl border ${form.isAdultContent ? 'border-red-500/40 bg-red-500/5' : 'border-gray-700'}`}>
          <input type="checkbox" id="isAdultContent" checked={form.isAdultContent}
            onChange={(e) => setForm({ ...form, isAdultContent: e.target.checked })}
            className="mt-0.5 rounded border-gray-600 bg-gray-800 text-red-500 focus:ring-red-500/50" />
          <div>
            <label htmlFor="isAdultContent" className="text-sm text-gray-300 font-medium cursor-pointer">Conteúdo adulto (+18)</label>
            {form.isAdultContent && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-red-400">
                <AlertTriangle className="w-3 h-3" />
                <span>Produto marcado como +18. Exige verificação de idade.</span>
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
              className="w-full max-w-[120px] px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 transition" />
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-4">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold disabled:opacity-50 transition">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {productStatus === 'DRAFT' && (
            <button type="button" disabled={submitLoading || saving}
              onClick={() => {
                if (!productId) return;
                setSubmitLoading(true); setError('');
                api.post(`/marketplace/product/${productId}/submit-for-approval`)
                  .then(() => navigate('/comercio/loja/produtos', { state: { message: 'Produto enviado para aprovação!' } }))
                  .catch((err) => setError(err.response?.data?.error || 'Erro ao enviar para aprovação'))
                  .finally(() => setSubmitLoading(false));
              }}
              className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold disabled:opacity-50 transition">
              {submitLoading ? 'Enviando...' : 'Enviar para aprovação'}
            </button>
          )}
          <button type="button" onClick={() => navigate('/comercio/loja/produtos')}
            className="px-6 py-2.5 rounded-xl bg-gray-700/50 hover:bg-gray-700 text-white font-medium transition">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

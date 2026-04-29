/**
 * Links de pagamento – criar e listar links com valor fixo (Modo Comércio).
 * Cada link gera uma URL que o cliente acessa para pagar o valor via Pix.
 */

import { useState, useEffect } from 'react';
import { Link2, Plus, Copy, Check, Trash2, ExternalLink, Eye, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type LinkItem = { id: string; titulo: string; amount: number; slug: string; isActive?: boolean; createdAt: string };

type MerchantSettings = {
  businessName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  useCustomBranding: boolean;
};

export default function ComercioLinks() {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [criando, setCriando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/pay` : '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ links: LinkItem[] }>('/commerce/links'),
      api.get<{ settings: MerchantSettings }>('/commerce/settings').catch(() => ({ data: { settings: null } })),
    ])
      .then(([linksRes, settingsRes]) => {
        if (!cancelled) {
          setLinks(linksRes.data.links ?? []);
          setSettings(settingsRes.data.settings);
        }
      })
      .catch((err) => {
        if (!cancelled) setErro(err?.response?.data?.error || 'Erro ao carregar dados');
      })
      .finally(() => {
        if (!cancelled) setCarregando(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = valor.trim().replace(',', '.');
    const v = parseFloat(normalized);
    if (isNaN(v) || v <= 0) {
      alert('Informe um valor válido em reais.');
      return;
    }
    setCriando(true);
    setErro(null);
    setSucesso(null);
    try {
      const { data } = await api.post<{ link: LinkItem }>('/commerce/links', { titulo: titulo.trim() || undefined, valor: v });
      setLinks((prev) => [data.link, ...prev]);
      setTitulo('');
      setValor('');
      setSucesso('Link criado com sucesso!');
      setTimeout(() => setSucesso(null), 4000);
    } catch (err: any) {
      setErro(err?.response?.data?.error || 'Erro ao criar link');
    } finally {
      setCriando(false);
    }
  };

  const copiar = (slugLink: string) => {
    const url = `${baseUrl}/${slugLink}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiadoId(slugLink);
      setTimeout(() => setCopiadoId(null), 3000);
    });
  };

  const remover = async (id: string) => {
    if (!window.confirm('Remover este link? A URL deixará de funcionar.')) return;
    try {
      await api.delete(`/commerce/links/${id}`);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err: any) {
      setErro(err?.response?.data?.error || 'Erro ao remover link');
    }
  };

  const formatarValor = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const previewValor = valor.trim() ? parseFloat(valor.trim().replace(',', '.')) : 0;
  const previewTitulo = titulo.trim() || 'Produto/Serviço';
  const useBranding = settings?.useCustomBranding && settings;
  const bgColor = useBranding && settings.backgroundColor ? settings.backgroundColor : '#111827';
  const textColor = useBranding && settings.textColor ? settings.textColor : '#FFFFFF';
  const primaryColor = useBranding && settings.primaryColor ? settings.primaryColor : '#FF6B00';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Banner de configurações */}
      {(!settings?.businessName || !settings?.useCustomBranding) && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 md:p-4">
          <div className="flex items-start gap-3">
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-yellow-400 text-xs md:text-sm font-medium mb-1">
                Personalize seus links de pagamento
              </p>
              <p className="text-yellow-300/80 text-xs mb-2">
                Configure logo, cores e informações do seu negócio para personalizar todos os links.
              </p>
              <button
                onClick={() => navigate('/comercio/config')}
                className="text-xs md:text-sm text-yellow-400 hover:text-yellow-300 font-medium underline"
              >
                Ir para configurações →
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs md:text-sm p-3 md:p-4">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs md:text-sm p-3 md:p-4">
          {sucesso}
        </div>
      )}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
        <h3 className="text-base md:text-lg font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />
          Novo Link
        </h3>
        <form onSubmit={handleCriar} className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <div className="flex-1">
            <label htmlFor="titulo" className="block text-xs font-medium text-gray-400 mb-1.5">
              Nome ou identificação (opcional)
            </label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Produto X, Serviço Y"
              className={`w-full px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 text-xs md:text-sm ${focusRing}`}
            />
          </div>
          <div className="w-full sm:w-32 md:w-40">
            <label htmlFor="valor" className="block text-xs font-medium text-gray-400 mb-1.5">
              Valor (R$)
            </label>
            <input
              id="valor"
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              required
              className={`w-full px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 text-xs md:text-sm ${focusRing}`}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              disabled={!titulo.trim() && !valor.trim()}
              className="px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-xs md:text-sm font-medium disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              <Eye className="w-3 h-3 md:w-4 md:h-4" />
              Preview
            </button>
            <button
              type="submit"
              disabled={criando}
              className="flex-1 sm:flex-none px-4 md:px-6 py-2 md:py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-semibold text-xs md:text-sm hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 transition-all"
            >
              {criando ? 'Criando...' : 'Criar Link'}
            </button>
          </div>
        </form>
        <p className="text-gray-500 text-xs mt-2 md:mt-3">
          O link será uma URL que você pode enviar ao cliente. Ao acessar, ele verá o valor e poderá pagar via Pix.
        </p>

        {/* Preview */}
        {showPreview && (titulo.trim() || valor.trim()) && (
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <p className="text-xs font-medium text-gray-400 mb-3">Preview do link:</p>
            <div
              className="rounded-xl p-4 md:p-6 border transition-all"
              style={{
                backgroundColor: useBranding ? `${bgColor}CC` : 'rgba(31, 41, 55, 0.5)',
                borderColor: useBranding ? `${textColor}30` : 'rgba(75, 85, 99, 0.5)',
                color: textColor,
              }}
            >
              {useBranding && settings.logoUrl && (
                <div className="flex justify-center mb-3">
                  <img
                    src={settings.logoUrl}
                    alt={settings.businessName || 'Logo'}
                    className="h-8 md:h-12 w-auto object-contain"
                    loading="lazy"
                  />
                </div>
              )}
              <p className="text-xs uppercase tracking-wider mb-1 opacity-70">Pagamento</p>
              <h4 className="text-base md:text-lg font-bold mb-1">{previewTitulo}</h4>
              <p className="text-xs md:text-sm mb-4 opacity-80">{settings?.businessName || 'Seu negócio'}</p>
              <p className="text-2xl md:text-3xl font-bold text-center" style={{ color: primaryColor }}>
                {previewValor > 0 ? formatarValor(previewValor) : 'R$ 0,00'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
        <h3 className="text-base md:text-lg font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
          <Link2 className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />
          Seus links
        </h3>
        {carregando ? (
          <div className="py-8 md:py-12 text-center text-gray-400 text-xs md:text-sm">Carregando...</div>
        ) : links.length === 0 ? (
          <div className="py-8 md:py-12 text-center">
            <Link2 className="w-10 h-10 md:w-12 md:h-12 text-gray-600 mx-auto mb-2 md:mb-3" />
            <p className="text-gray-400 text-xs md:text-sm">Nenhum link criado ainda.</p>
            <p className="text-gray-500 text-xs mt-1">Crie um link acima para compartilhar com seus clientes.</p>
          </div>
        ) : (
          <ul className="space-y-2 md:space-y-3">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-col gap-2 md:gap-3 p-3 md:p-4 rounded-xl bg-gray-900/50 border border-gray-700/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm md:text-base truncate">{link.titulo || 'Sem título'}</p>
                  <p className="text-bitcoin font-semibold text-sm md:text-base">{formatarValor(link.amount)}</p>
                  <p className="text-gray-500 text-xs truncate mt-1">{baseUrl}/{link.slug}</p>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => copiar(link.slug)}
                    className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs md:text-sm font-medium"
                  >
                    {copiadoId === link.slug ? <Check className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> : <Copy className="w-3 h-3 md:w-4 md:h-4" />}
                    <span className="hidden sm:inline">{copiadoId === link.slug ? 'Copiado!' : 'Copiar'}</span>
                    <span className="sm:hidden">{copiadoId === link.slug ? '✓' : 'Copiar'}</span>
                  </button>
                  <a
                    href={`${baseUrl}/${link.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs md:text-sm font-medium"
                  >
                    <ExternalLink className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Abrir</span>
                    <span className="sm:hidden">Ver</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => remover(link.id)}
                    className="p-1.5 md:p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Remover link"
                  >
                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

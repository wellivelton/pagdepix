/**
 * Páginas pré-prontas – criar páginas onde o cliente escolhe o valor antes de pagar.
 * O cliente pode escolher valores pré-definidos (10, 20, 30, etc.) ou definir um valor customizado.
 */

import { useState, useEffect } from 'react';
import { FileText, Plus, Copy, Check, Trash2, ExternalLink, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type PageItem = { id: string; titulo: string; slug: string; isActive?: boolean; createdAt: string };

type MerchantSettings = {
  businessName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  useCustomBranding: boolean;
};

export default function ComercioPaginas() {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [criando, setCriando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/page` : '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ pages: PageItem[] }>('/commerce/pages'),
      api.get<{ settings: MerchantSettings }>('/commerce/settings').catch(() => ({ data: { settings: null } })),
    ])
      .then(([pagesRes, settingsRes]) => {
        if (!cancelled) {
          setPages(pagesRes.data.pages ?? []);
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
    setCriando(true);
    setErro(null);
    setSucesso(null);
    try {
      const { data } = await api.post<{ page: PageItem }>('/commerce/pages', { 
        titulo: titulo.trim() || undefined 
      });
      setPages((prev) => [data.page, ...prev]);
      setTitulo('');
      setSucesso('Página criada com sucesso!');
      setTimeout(() => setSucesso(null), 4000);
    } catch (err: any) {
      setErro(err?.response?.data?.error || 'Erro ao criar página');
    } finally {
      setCriando(false);
    }
  };

  const copiar = (slugPage: string) => {
    const url = `${baseUrl}/${slugPage}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiadoId(slugPage);
      setTimeout(() => setCopiadoId(null), 2000);
    });
  };

  const remover = async (id: string) => {
    if (!window.confirm('Remover esta página? A URL deixará de funcionar.')) return;
    try {
      await api.delete(`/commerce/pages/${id}`);
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setErro(err?.response?.data?.error || 'Erro ao remover página');
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Banner de configurações */}
      {(!settings?.businessName || !settings?.useCustomBranding) && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 md:p-4">
          <div className="flex items-start gap-3">
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-yellow-400 text-xs md:text-sm font-medium mb-1">
                Personalize suas páginas de pagamento
              </p>
              <p className="text-yellow-300/80 text-xs mb-2">
                Configure logo, cores e informações do seu negócio para personalizar todas as páginas.
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
          Nova página pré-pronta
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
              placeholder="Ex: Doações, Evento, Produtos"
              className={`w-full px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 text-xs md:text-sm ${focusRing}`}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={criando}
              className="flex-1 sm:flex-none px-4 md:px-6 py-2 md:py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-semibold text-xs md:text-sm hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 transition-all"
            >
              {criando ? 'Criando...' : 'Criar Página'}
            </button>
          </div>
        </form>
        <p className="text-gray-500 text-xs mt-2 md:mt-3">
          O cliente acessará esta página e poderá escolher valores pré-definidos (R$ 10, R$ 20, R$ 30, etc.) ou definir um valor customizado antes de pagar.
        </p>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
        <h3 className="text-base md:text-lg font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />
          Suas páginas
        </h3>
        {carregando ? (
          <div className="py-8 md:py-12 text-center text-gray-400 text-xs md:text-sm">Carregando...</div>
        ) : pages.length === 0 ? (
          <div className="py-8 md:py-12 text-center">
            <FileText className="w-10 h-10 md:w-12 md:h-12 text-gray-600 mx-auto mb-2 md:mb-3" />
            <p className="text-gray-400 text-xs md:text-sm">Nenhuma página criada ainda.</p>
            <p className="text-gray-500 text-xs mt-1">Crie uma página acima para compartilhar com seus clientes.</p>
          </div>
        ) : (
          <ul className="space-y-2 md:space-y-3">
            {pages.map((page) => (
              <li
                key={page.id}
                className="flex flex-col gap-2 md:gap-3 p-3 md:p-4 rounded-xl bg-gray-900/50 border border-gray-700/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm md:text-base truncate">{page.titulo || 'Sem título'}</p>
                  <p className="text-gray-500 text-xs truncate mt-1">{baseUrl}/{page.slug}</p>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => copiar(page.slug)}
                    className="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs md:text-sm font-medium"
                  >
                    {copiadoId === page.slug ? <Check className="w-3 h-3 md:w-4 md:h-4 text-green-400" /> : <Copy className="w-3 h-3 md:w-4 md:h-4" />}
                    <span className="hidden sm:inline">{copiadoId === page.slug ? 'Copiado!' : 'Copiar'}</span>
                    <span className="sm:hidden">{copiadoId === page.slug ? '✓' : 'Copiar'}</span>
                  </button>
                  <a
                    href={`${baseUrl}/${page.slug}`}
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
                    onClick={() => remover(page.id)}
                    className="p-1.5 md:p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Remover página"
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

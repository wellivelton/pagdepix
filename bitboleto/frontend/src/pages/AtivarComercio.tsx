import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Building2,
  ChevronRight,
  Loader2,
  CheckCircle,
  Zap,
  Link2,
  FileText,
  ShoppingBag,
  Shield,
  AlertTriangle,
  Copy,
  Check,
  QrCode,
  Briefcase,
} from 'lucide-react';
import { isValidCNPJ, formatCNPJ } from '../utils/cpfCnpj';
import api from '../services/api';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

const TIPOS_NEGOCIO = [
  'Lanchonete / Restaurante',
  'Comércio varejista',
  'Serviços gerais',
  'Bar / Cantina',
  'Salão de beleza',
  'Oficina',
  'Food truck',
  'Loja de roupas',
  'Farmácia / Drogaria',
  'Outro',
];

const inputClass = `w-full pl-10 pr-3 py-3 bg-gray-900/50 rounded-xl border border-gray-600 text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all text-sm ${focusRing}`;
const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none';

type Step = 'info' | 'form' | 'deposit' | 'polling' | 'success';

export default function AtivarComercio() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cnpjError, setCnpjError] = useState('');
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  const [form, setForm] = useState({
    cnpj: '',
    businessName: '',
    tipoNegocio: '',
    tipoNegocioOutro: '',
  });

  const [cnpjInfo, setCnpjInfo] = useState<{ razaoSocial?: string; situacao?: string } | null>(null);
  const [depositData, setDepositData] = useState<{
    orderId: string;
    qr_image_url: string;
    qr_copy_paste: string;
    amount: string;
  } | null>(null);

  useEffect(() => {
    checkExistingStatus();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const checkExistingStatus = async () => {
    try {
      const { data } = await api.get('/commerce/activation-status');
      if (data.status === 'APPROVED') {
        navigate('/comercio/dashboard');
      } else if (data.status === 'AWAITING_DEPOSIT') {
        setStep('deposit');
      }
    } catch { /* ignore */ }
  };

  const handleChange = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
    if (field === 'cnpj') {
      setForm((p) => ({ ...p, cnpj: value.replace(/\D/g, '').slice(0, 14) }));
      setCnpjError('');
    }
  };

  const cnpjValido = isValidCNPJ(form.cnpj);
  const tipoNegocioValido = form.tipoNegocio === 'Outro' ? form.tipoNegocioOutro.trim().length > 0 : form.tipoNegocio.length > 0;
  const canSubmit = cnpjValido && tipoNegocioValido && form.businessName.trim().length >= 2;

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidCNPJ(form.cnpj)) {
      setCnpjError('CNPJ invalido. Verifique os digitos.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/commerce/activate', {
        cnpj: form.cnpj.replace(/\D/g, ''),
        businessName: form.businessName.trim(),
        tipoNegocio: form.tipoNegocio === 'Outro' ? form.tipoNegocioOutro.trim() : form.tipoNegocio,
      });
      if (data.cnpjInfo) setCnpjInfo(data.cnpjInfo);
      setStep('deposit');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao solicitar ativacao.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDeposit = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/commerce/initial-deposit/generate');
      setDepositData(data);
      setStep('polling');
      startPolling();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar deposito.');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollingCountRef.current++;
      if (pollingCountRef.current > 150) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        return;
      }
      try {
        const { data } = await api.get('/commerce/initial-deposit/status');
        if (data.status === 'APPROVED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          stored.commercePartner = true;
          localStorage.setItem('user', JSON.stringify(stored));
          setStep('success');
        }
      } catch { /* ignore */ }
    }, 4000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-8 text-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Modo Comércio Ativado!</h2>
          <p className="text-gray-400 text-sm mb-3">
            Seu depósito foi confirmado e os R$ 5,00 foram creditados como colateral. Configure sua carteira Liquid e comece a receber pagamentos.
          </p>
          <div className="bg-gray-900/50 rounded-xl p-4 mb-6 border border-gray-700/30 text-left">
            <p className="text-gray-300 text-sm font-medium mb-1">Limites atuais</p>
            <p className="text-gray-400 text-xs">R$ 505,00 por transação | R$ 505,00 por pagador/dia (R$ 500 base + R$ 5 de colateral)</p>
            <p className="text-gray-400 text-xs mt-1">Você pode aumentar seus limites depositando mais colateral no painel.</p>
          </div>
          <button
            onClick={() => navigate('/comercio/dashboard')}
            className={`w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold hover:shadow-lg hover:shadow-bitcoin/30 transition-all ${focusRing}`}
          >
            Ir para o Painel Comercio
          </button>
        </div>
      </div>
    );
  }

  if (step === 'polling' && depositData) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-bitcoin/10 rounded-xl">
              <QrCode className="w-7 h-7 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Deposito Inicial</h2>
              <p className="text-gray-400 text-sm">Pague R$ {depositData.amount} via Pix</p>
            </div>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-yellow-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-300 text-xs">
                Use uma conta bancaria vinculada ao CNPJ informado. Divergencias resultarao em bloqueio.
              </p>
            </div>
          </div>

          <div className="flex justify-center mb-4">
            <img
              src={depositData.qr_image_url}
              alt="QR Code Pix"
              className="w-56 h-56 rounded-xl bg-white p-2"
            />
          </div>

          <div className="mb-4">
            <p className="text-gray-400 text-xs mb-2 text-center">Pix Copia e Cola:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={depositData.qr_copy_paste}
                className="flex-1 py-2 px-3 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-xs truncate"
              />
              <button
                onClick={() => copyToClipboard(depositData.qr_copy_paste)}
                className={`p-2 rounded-xl border border-gray-600 hover:border-bitcoin transition-all ${focusRing}`}
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Aguardando confirmacao do pagamento...</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'deposit') {
    return (
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-bitcoin/10 rounded-xl">
              <Shield className="w-7 h-7 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Validacao Financeira</h2>
              <p className="text-gray-400 text-sm">Deposito inicial obrigatorio</p>
            </div>
          </div>

          {cnpjInfo && (
            <div className="bg-green-500/10 rounded-xl p-4 mb-4 border border-green-500/30">
              <p className="text-green-400 text-sm font-medium">CNPJ validado na Receita Federal</p>
              {cnpjInfo.razaoSocial && <p className="text-green-300 text-xs mt-1">{cnpjInfo.razaoSocial}</p>}
              {cnpjInfo.situacao && <p className="text-green-300 text-xs">Situacao: {cnpjInfo.situacao}</p>}
            </div>
          )}

          <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700/30">
            <p className="text-gray-300 text-sm font-medium mb-2">Por que o depósito?</p>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>- Comprova titularidade bancária vinculada ao CNPJ</li>
              <li>- Prova de posse da conta bancária</li>
              <li>- Prevenção contra fraudes (MED)</li>
              <li>- Ativação automática após confirmação</li>
              <li>- O valor é creditado como colateral (aumenta seu limite)</li>
            </ul>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4 mb-6 border border-bitcoin/30">
            <div className="flex items-center justify-between">
              <p className="text-gray-300 text-sm font-medium">Valor do depósito</p>
              <p className="text-bitcoin text-xl font-bold">R$ 5,00</p>
            </div>
            <p className="text-gray-500 text-xs mt-2">Será creditado como colateral após confirmação.</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerateDeposit}
            disabled={loading}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-base hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${focusRing}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Gerando Pix...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Gerar QR Code Pix (R$ 5,00)
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-bitcoin/10 rounded-xl">
              <Store className="w-7 h-7 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Modo Comercio</h2>
              <p className="text-gray-400 text-sm">Receba pagamentos com Depix no seu negocio</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {[
              { icon: Link2, title: 'Links de Pagamento', desc: 'Crie links para cobrar clientes via Pix' },
              { icon: FileText, title: 'Paginas Pre-prontas', desc: 'Paginas personalizadas de cobranca' },
              { icon: ShoppingBag, title: 'Loja (Marketplace)', desc: 'Venda produtos digitais com Depix' },
              { icon: Zap, title: 'Recebimento Rapido', desc: 'Pagamentos confirmados na hora' },
            ].map((f) => (
              <div key={f.title} className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                <f.icon className="w-5 h-5 text-bitcoin mb-2" />
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-gray-400 text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4 mb-4 border border-gray-700/30">
            <p className="text-gray-300 text-sm font-medium mb-2">Taxas do Modo Comercio</p>
            <p className="text-gray-400 text-xs">0,5% + R$ 0,99 por transacao recebida. Sem mensalidade.</p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4 mb-6 border border-yellow-500/20">
            <div className="flex items-start gap-2 mb-2">
              <Shield className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-300 text-sm font-medium">Regras Antifraude</p>
            </div>
            <ul className="text-gray-400 text-xs space-y-1 ml-7">
              <li>- Exigimos CNPJ ativo na Receita Federal</li>
              <li>- Depósito inicial de R$ 5,00 (valida conta e é creditado como colateral)</li>
              <li>- Limite inicial: R$ 505 (R$ 500 + R$ 5 do depósito inicial)</li>
              <li>- Aumento de limite via depósito de colateral (garantia)</li>
              <li>- Bloqueios automáticos em caso de inconsistência</li>
            </ul>
          </div>

          <button
            onClick={() => setStep('form')}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-base hover:shadow-lg hover:shadow-bitcoin/30 transition-all flex items-center justify-center gap-2 ${focusRing}`}
          >
            Quero ativar o Modo Comercio
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 md:p-8">
        <h2 className="text-xl font-bold text-white mb-1">Ativar Modo Comercio</h2>
        <p className="text-gray-400 text-sm mb-6">Informe os dados do seu negocio.</p>

        <form onSubmit={handleSubmitForm} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">CNPJ</label>
            <div className="relative group">
              <Building2 className={iconClass} />
              <input
                type="text"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={formatCNPJ(form.cnpj)}
                onChange={(e) => handleChange('cnpj', e.target.value)}
                className={inputClass}
              />
            </div>
            {cnpjError && <p className="text-red-400 text-xs mt-1">{cnpjError}</p>}
            {form.cnpj.length === 14 && !cnpjValido && (
              <p className="text-red-400 text-xs mt-1">CNPJ invalido</p>
            )}
            {cnpjValido && (
              <p className="text-green-400 text-xs mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Formato valido
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Nome do negocio</label>
            <div className="relative group">
              <Briefcase className={iconClass} />
              <input
                type="text"
                placeholder="Ex: Lanchonete do Joao"
                value={form.businessName}
                onChange={(e) => handleChange('businessName', e.target.value)}
                className={inputClass}
                maxLength={100}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de negocio</label>
            <select
              value={form.tipoNegocio}
              onChange={(e) => handleChange('tipoNegocio', e.target.value)}
              className={`w-full py-3 px-3 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all ${focusRing}`}
            >
              <option value="" disabled>Selecione o tipo</option>
              {TIPOS_NEGOCIO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {form.tipoNegocio === 'Outro' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Qual tipo?</label>
              <input
                type="text"
                placeholder="Descreva seu negocio"
                value={form.tipoNegocioOutro}
                onChange={(e) => handleChange('tipoNegocioOutro', e.target.value)}
                className={`w-full py-3 px-3 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all ${focusRing}`}
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-base hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${focusRing}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Validando CNPJ...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Validar e Prosseguir
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

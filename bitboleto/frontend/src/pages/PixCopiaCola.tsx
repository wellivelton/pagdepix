import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Copy, Check, Upload, AlertTriangle, Info,
  ChevronRight, ArrowLeft, Loader2, CheckCircle2, XCircle,
  Tag, Wallet,
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, formatCryptoAmount, type Currency } from '../components/CurrencySelector';
import { RateLockCountdown } from '../components/RateLockCountdown';

// ========================================
// TIPOS
// ========================================
interface CalcResult {
  taxa?: number;
  valorTaxa?: number;
  totalFinal?: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  paymentCurrency?: string;
  exchangeRate?: number | null;
  cryptoAmount?: string | null;
}

interface PccRecord {
  id: string;
  codigoPix: string;
  valorOriginal: number;
  taxa: number;
  valorTaxa: number;
  totalFinal: number;
  nomeDestinatario: string;
  contatoTelegram?: string;
  contatoEmail?: string;
  contatoWhatsApp?: string;
  cupomUsado?: string;
  paymentCurrency: string;
  walletAddress: string;
  txid?: string;
  comprovante?: string;
  status: string;
  exchangeRate?: number;
  cryptoAmount?: string;
  rateLockExpiresAt?: string;
  createdAt: string;
}

// ========================================
// HELPERS
// ========================================
function parseBrl(value: string): number {
  const s = value.trim().replace(/\s/g, '');
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(n);
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ========================================
// COMPONENTE PRINCIPAL
// ========================================
export default function PixCopiaCola() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Formulário Step 1
  const [codigoPix, setCodigoPix] = useState('');
  const [valorInput, setValorInput] = useState('');
  const [nomeDestinatario, setNomeDestinatario] = useState('');
  const [contatoTelegram, setContatoTelegram] = useState('');
  const [contatoEmail, setContatoEmail] = useState('');
  const [contatoWhatsApp, setContatoWhatsApp] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DEPIX');
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);

  // Step 2
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Step 3
  const [record, setRecord] = useState<PccRecord | null>(null);
  const [txid, setTxid] = useState('');
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [rateExpired, setRateExpired] = useState(false);
  const [submittingTxid, setSubmittingTxid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Preview de taxa em tempo real (client-side)
  const valorNum = parseBrl(valorInput);
  const feePreview = !isNaN(valorNum) && valorNum >= 20
    ? { taxa: 0.03, valorTaxa: Math.ceil(valorNum * 0.03 * 100) / 100 }
    : null;

  // ========================================
  // POLLING de status (Step 3)
  // ========================================
  const startPolling = useCallback((id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<PccRecord>(`/pix-copia-cola/${id}`);
        setRecord(data);
        if (data.status === 'APPROVED' || data.status === 'REJECTED') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setStep(4);
        }
      } catch { /* ignora erros de polling */ }
    }, 10_000);
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ========================================
  // APLICAR CUPOM
  // ========================================
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    const amount = parseBrl(valorInput);
    if (isNaN(amount) || amount < 20) {
      setCouponError('Informe o valor primeiro (mínimo R$ 20,00).');
      return;
    }
    setApplyingCoupon(true);
    setCouponError('');
    try {
      const { data } = await api.post('/pix-copia-cola/calculate', {
        valorOriginal: amount,
        couponCode: couponCode.trim(),
        paymentCurrency,
      });
      if (data.cupomValido) {
        setAppliedCoupon(couponCode.trim().toUpperCase());
        setCalcResult(data);
        setCouponError('');
      } else {
        setCouponError('Cupom inválido ou indisponível.');
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError('Erro ao validar cupom. Tente novamente.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  // ========================================
  // CALCULAR e ir para Step 2
  // ========================================
  const handleCalculate = async () => {
    setError('');
    const amount = parseBrl(valorInput);
    if (isNaN(amount) || amount < 20) {
      setError('Valor mínimo: R$ 20,00.');
      return;
    }
    if (!codigoPix.trim()) { setError('Cole o código Pix Copia e Cola.'); return; }
    if (!nomeDestinatario.trim()) { setError('Informe o nome do destinatário.'); return; }
    if (!contatoTelegram.trim() && !contatoEmail.trim() && !contatoWhatsApp.trim()) {
      setError('Informe pelo menos um contato (Telegram, e-mail ou WhatsApp).');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/pix-copia-cola/calculate', {
        valorOriginal: amount,
        couponCode: appliedCoupon || undefined,
        paymentCurrency,
      });
      setCalcResult(data);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao calcular taxa. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // CONFIRMAR PEDIDO (Step 2 → Step 3)
  // ========================================
  const handleConfirm = async () => {
    if (!termsAccepted) { setError('Aceite os termos para continuar.'); return; }
    setError('');
    setLoading(true);
    try {
      const amount = parseBrl(valorInput);
      const { data } = await api.post<PccRecord>('/pix-copia-cola/create', {
        codigoPix: codigoPix.trim(),
        valorOriginal: amount,
        nomeDestinatario: nomeDestinatario.trim(),
        contatoTelegram: contatoTelegram.trim() || undefined,
        contatoEmail: contatoEmail.trim() || undefined,
        contatoWhatsApp: contatoWhatsApp.trim() || undefined,
        couponCode: appliedCoupon || undefined,
        paymentCurrency,
      });
      setRecord(data);
      setStep(3);
      startPolling(data.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // SUBMETER TXID (Step 3)
  // ========================================
  const handleSubmitTxid = async () => {
    if (!txid.trim() || txid.trim().length < 10) {
      setError('TXID inválido (mínimo 10 caracteres).');
      return;
    }
    setError('');
    setSubmittingTxid(true);
    try {
      const formData = new FormData();
      formData.append('txid', txid.trim());
      if (comprovanteFile) formData.append('comprovante', comprovanteFile);

      const { data } = await api.put<PccRecord>(`/pix-copia-cola/${record!.id}/txid`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setRecord(data);
      startPolling(data.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar TXID. Tente novamente.');
    } finally {
      setSubmittingTxid(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ========================================
  // RENDER
  // ========================================
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header com etapas */}
      <div className="flex items-center gap-3">
        {step > 1 && step < 4 && (
          <button
            onClick={() => { setStep((s) => Math.max(1, s - 1) as any); setError(''); }}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-white">Pagar Pix Copia e Cola</h1>
          {step < 4 && (
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${
                    s === step ? 'w-8 bg-green-400' : s < step ? 'w-4 bg-green-600' : 'w-4 bg-gray-700'
                  }`}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">Etapa {step}/3</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ============================
          STEP 1 — FORMULÁRIO
          ============================ */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Código Pix */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Código Pix Copia e Cola <span className="text-red-400">*</span>
            </label>
            <textarea
              value={codigoPix}
              onChange={(e) => setCodigoPix(e.target.value)}
              placeholder="Cole aqui o código Pix completo..."
              rows={4}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors font-mono text-sm resize-none"
            />
          </div>

          {/* Valor */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Valor do pagamento (R$) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valorInput}
                onChange={(e) => {
                  setValorInput(e.target.value);
                  setCalcResult(null);
                  setAppliedCoupon(null);
                }}
                placeholder="0,00"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors"
              />
            </div>
            {feePreview && (
              <p className="text-xs text-gray-500 mt-1">
                Taxa estimada: R$ {formatBrl(feePreview.valorTaxa)} (3%) — Total: R$ {formatBrl(valorNum + feePreview.valorTaxa)}
              </p>
            )}
          </div>

          {/* Nome do destinatário */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nome do destinatário <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nomeDestinatario}
              onChange={(e) => setNomeDestinatario(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors"
            />
          </div>

          {/* Contatos */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Contato para acompanhamento <span className="text-red-400">*</span>
              <span className="text-gray-500 font-normal ml-1">(pelo menos um)</span>
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={contatoTelegram}
                onChange={(e) => setContatoTelegram(e.target.value)}
                placeholder="@usuario no Telegram"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors text-sm"
              />
              <input
                type="email"
                value={contatoEmail}
                onChange={(e) => setContatoEmail(e.target.value)}
                placeholder="E-mail"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors text-sm"
              />
              <input
                type="tel"
                value={contatoWhatsApp}
                onChange={(e) => setContatoWhatsApp(e.target.value)}
                placeholder="WhatsApp (+55 DDD número)"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors text-sm"
              />
            </div>
          </div>

          {/* Moeda de pagamento */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Moeda de pagamento</label>
            <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />
          </div>

          {/* Cupom */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Cupom de desconto <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder="CÓDIGO"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors text-sm font-mono"
                />
              </div>
              <button
                onClick={handleApplyCoupon}
                disabled={applyingCoupon || !couponCode.trim()}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-colors"
              >
                {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
              </button>
            </div>
            {couponError && <p className="text-xs text-red-400 mt-1">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-xs text-green-400 mt-1">
                Cupom {appliedCoupon} aplicado!
                {calcResult?.descontoAplicado && ` Desconto: ${calcResult.descontoAplicado}`}
              </p>
            )}
          </div>

          {/* Avisos obrigatórios */}
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold">Leia com atenção antes de continuar</span>
            </div>
            <ul className="text-xs text-amber-300/80 space-y-1.5 ml-6 list-disc">
              <li>Você é responsável pelo código Pix e pelo valor informado. Verifique com cuidado antes de enviar.</li>
              <li>Após confirmação do seu pagamento em cripto, o Pix é enviado ao destinatário em minutos.</li>
              <li>Se houver algum problema (código inválido, expirado ou valor incorreto), entraremos em contato pelo meio informado em até 2 dias úteis.</li>
              <li>Sem resposta dentro desse prazo, a solicitação será encerrada e o valor retido por até 30 dias para resolução.</li>
            </ul>
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Calcular taxa <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      )}

      {/* ============================
          STEP 2 — REVISÃO + ACEITE
          ============================ */}
      {step === 2 && calcResult && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Confirme os valores</h2>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Valor do pagamento</span>
              <span className="text-white font-medium">R$ {formatBrl(parseBrl(valorInput))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Taxa de serviço ({((calcResult.taxa ?? 0.03) * 100).toFixed(2).replace('.', ',')}%)</span>
              <span className="text-yellow-400 font-medium">+ R$ {formatBrl(calcResult.valorTaxa ?? 0)}</span>
            </div>
            {appliedCoupon && calcResult.descontoAplicado && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Cupom ({appliedCoupon})</span>
                <span className="text-green-400">Desconto {calcResult.descontoAplicado}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-2 flex justify-between">
              <span className="text-gray-300 font-semibold">Total a pagar</span>
              <span className="text-white font-bold text-lg">R$ {formatBrl(calcResult.totalFinal ?? 0)}</span>
            </div>
            {calcResult.cryptoAmount && (
              <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                <span className="text-gray-400">Em {paymentCurrency}</span>
                <span className="text-bitcoin font-mono font-medium">
                  {formatCryptoAmount(calcResult.cryptoAmount, paymentCurrency)}
                </span>
              </div>
            )}
          </div>

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Destinatário</span>
              <span className="text-white">{nomeDestinatario}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Contato</span>
              <span className="text-white truncate max-w-[60%] text-right">
                {contatoTelegram || contatoEmail || contatoWhatsApp}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Código Pix</span>
              <span className="text-gray-300 font-mono text-xs truncate max-w-[60%]">
                {codigoPix.slice(0, 30)}…
              </span>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-800/30 border border-gray-700/50 rounded-xl">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-green-400"
            />
            <span className="text-sm text-gray-300">
              Li e aceito os termos de uso. Entendo que sou responsável pelo código Pix e pelo
              valor informado. Caso haja algum problema (código inválido, expirado ou valor
              incorreto), serei contactado pelo meio informado em até 2 dias úteis.
            </span>
          </label>

          <button
            onClick={handleConfirm}
            disabled={loading || !termsAccepted}
            className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirmar pedido <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      )}

      {/* ============================
          STEP 3 — PAGAMENTO CRIPTO
          ============================ */}
      {step === 3 && record && (
        <div className="space-y-4">
          {record.status === 'TXID_SUBMITTED' ? (
            <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-500/30 rounded-xl">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              <div>
                <p className="text-blue-300 font-semibold text-sm">Pagamento em análise</p>
                <p className="text-blue-300/70 text-xs mt-0.5">Nosso time está verificando sua transação. Aguarde.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-2">
                <p className="text-sm text-gray-400">Total a pagar:</p>
                <p className="text-2xl font-bold text-white">R$ {formatBrl(record.totalFinal)}</p>
                {record.cryptoAmount && (
                  <p className="text-bitcoin font-mono text-sm">
                    {formatCryptoAmount(record.cryptoAmount, record.paymentCurrency as Currency)} {record.paymentCurrency}
                  </p>
                )}
              </div>

              {record.rateLockExpiresAt && !rateExpired && (
                <RateLockCountdown
                  expiresAt={record.rateLockExpiresAt}
                  onExpire={() => setRateExpired(true)}
                />
              )}
              {rateExpired && (
                <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  Cotação expirada. Crie uma nova solicitação.
                </div>
              )}

              {/* Endereço da carteira */}
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
                  <Wallet className="w-4 h-4" />
                  <span>
                    {record.paymentCurrency === 'USDT' ? 'Endereço USDT (Liquid Network)' :
                     record.paymentCurrency === 'BTC' ? 'Endereço Bitcoin (Liquid Network)' : 'Endereço DePix (Liquid Network)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-bitcoin font-mono text-xs md:text-sm break-all min-w-0">
                    {record.walletAddress}
                  </code>
                  <button
                    onClick={() => copyToClipboard(record.walletAddress)}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                    title="Copiar endereço"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-bitcoin" />}
                  </button>
                </div>
              </div>

              {/* TXID */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    TXID da transação <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={txid}
                    onChange={(e) => setTxid(e.target.value)}
                    placeholder="Hash/ID da transação na blockchain"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors font-mono text-sm"
                  />
                </div>

                {/* Comprovante (opcional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Comprovante <span className="text-gray-500 font-normal">(opcional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-xl text-sm text-gray-400 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {comprovanteFile ? comprovanteFile.name : 'Enviar imagem ou PDF'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <button
                  onClick={handleSubmitTxid}
                  disabled={submittingTxid || !txid.trim() || rateExpired}
                  className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {submittingTxid ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Já paguei — informar TXID'}
                </button>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-900/20 border border-blue-500/20 rounded-xl text-blue-300/80 text-xs">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Após informar o TXID, nossa equipe irá verificar a transação e realizar o
                  pagamento. O processamento é normalmente concluído em minutos.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================
          STEP 4 — CONCLUSÃO
          ============================ */}
      {step === 4 && record && (
        <div className="space-y-4 text-center">
          {record.status === 'APPROVED' ? (
            <>
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Pagamento aprovado!</h2>
              <p className="text-gray-400">
                Seu pagamento de R$ {formatBrl(record.valorOriginal)} para{' '}
                <span className="text-white font-medium">{record.nomeDestinatario}</span> foi processado com sucesso.
              </p>
            </>
          ) : (
            <>
              <XCircle className="w-16 h-16 text-red-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Pagamento reprovado</h2>
              <p className="text-gray-400">
                Houve um problema com sua solicitação. Entre em contato com o suporte para mais informações.
              </p>
            </>
          )}

          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-2 text-sm text-left">
            <div className="flex justify-between">
              <span className="text-gray-400">ID da solicitação</span>
              <span className="text-gray-300 font-mono text-xs">{record.id.slice(0, 16)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Destinatário</span>
              <span className="text-white">{record.nomeDestinatario}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Valor</span>
              <span className="text-white">R$ {formatBrl(record.valorOriginal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Taxa</span>
              <span className="text-yellow-400">R$ {formatBrl(record.valorTaxa)}</span>
            </div>
          </div>

          <a
            href="/historico"
            className="inline-block px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-medium transition-colors"
          >
            Ver histórico de transações
          </a>
        </div>
      )}
    </div>
  );
}

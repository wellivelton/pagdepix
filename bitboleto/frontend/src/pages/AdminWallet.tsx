import { useState, useEffect } from 'react';
import { 
  Wallet as WalletIcon, 
  Copy, 
  Check, 
  Upload,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Bitcoin,
  Shield
} from 'lucide-react';
import api from '../services/api';

const TABS = [
  { id: 'depix', label: 'Depix (DPX)', color: 'from-bitcoin to-orange-600' },
  { id: 'usdt', label: 'USDT (Liquid)', color: 'from-green-500 to-emerald-600' },
  { id: 'btc', label: 'Bitcoin (L-BTC)', color: 'from-yellow-500 to-amber-600' },
] as const;

export default function AdminWallet() {
  const [walletAddress, setWalletAddress] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('/qr-code.png');
  const [walletAddressUsdt, setWalletAddressUsdt] = useState('');
  const [qrCodeUrlUsdt, setQrCodeUrlUsdt] = useState('');
  const [walletAddressBtc, setWalletAddressBtc] = useState('');
  const [qrCodeUrlBtc, setQrCodeUrlBtc] = useState('');
  const [rateLockMinutes, setRateLockMinutes] = useState(10);
  const [commerceWalletDepix, setCommerceWalletDepix] = useState('');
  const [qrCodeFile, setQrCodeFile] = useState<File | null>(null);
  const [qrCodeFileUsdt, setQrCodeFileUsdt] = useState<File | null>(null);
  const [qrCodeFileBtc, setQrCodeFileBtc] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'depix' | 'usdt' | 'btc'>('depix');

  useEffect(() => {
    loadWalletConfig();
  }, []);

  const loadWalletConfig = async () => {
    try {
      const response = await api.get('/admin/wallet-config');
      setWalletAddress(response.data.walletAddress || '');
      setQrCodeUrl(response.data.qrCodeUrl || '/qr-code.png');
      setWalletAddressUsdt(response.data.walletAddressUsdt || '');
      setQrCodeUrlUsdt(response.data.qrCodeUrlUsdt || '');
      setWalletAddressBtc(response.data.walletAddressBtc || '');
      setQrCodeUrlBtc(response.data.qrCodeUrlBtc || '');
      setRateLockMinutes(response.data.rateLockMinutes ?? 10);
      setCommerceWalletDepix(response.data.commerceWalletDepix || '');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const uploadQrFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/upload/boleto', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.url;
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      let finalQrDepix = qrCodeUrl;
      let finalQrUsdt = qrCodeUrlUsdt;
      let finalQrBtc = qrCodeUrlBtc;

      if (qrCodeFile) finalQrDepix = await uploadQrFile(qrCodeFile);
      if (qrCodeFileUsdt) finalQrUsdt = await uploadQrFile(qrCodeFileUsdt);
      if (qrCodeFileBtc) finalQrBtc = await uploadQrFile(qrCodeFileBtc);

      await api.put('/admin/wallet-config', { 
        walletAddress: walletAddress.trim(),
        qrCodeUrl: finalQrDepix.trim(),
        walletAddressUsdt: walletAddressUsdt.trim() || null,
        qrCodeUrlUsdt: finalQrUsdt.trim() || null,
        walletAddressBtc: walletAddressBtc.trim() || null,
        qrCodeUrlBtc: finalQrBtc.trim() || null,
        rateLockMinutes,
        commerceWalletDepix: commerceWalletDepix.trim() || null,
      });

      setQrCodeUrl(finalQrDepix);
      setQrCodeUrlUsdt(finalQrUsdt);
      setQrCodeUrlBtc(finalQrBtc);
      setSuccess('Configurações salvas com sucesso!');
      setQrCodeFile(null);
      setQrCodeFileUsdt(null);
      setQrCodeFileBtc(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  const walletFields: Record<string, {
    address: string; setAddress: (v: string) => void;
    qr: string; setQr: (v: string) => void;
    file: File | null; setFile: (f: File | null) => void;
    label: string; assetName: string;
  }> = {
    depix: { address: walletAddress, setAddress: setWalletAddress, qr: qrCodeUrl, setQr: setQrCodeUrl, file: qrCodeFile, setFile: setQrCodeFile, label: 'Depix (DPX)', assetName: 'Depix' },
    usdt: { address: walletAddressUsdt, setAddress: setWalletAddressUsdt, qr: qrCodeUrlUsdt, setQr: setQrCodeUrlUsdt, file: qrCodeFileUsdt, setFile: setQrCodeFileUsdt, label: 'USDT (Liquid)', assetName: 'USDT' },
    btc: { address: walletAddressBtc, setAddress: setWalletAddressBtc, qr: qrCodeUrlBtc, setQr: setQrCodeUrlBtc, file: qrCodeFileBtc, setFile: setQrCodeFileBtc, label: 'Bitcoin (L-BTC)', assetName: 'Bitcoin' },
  };

  const current = walletFields[activeTab];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-bitcoin to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-bitcoin/20">
            <WalletIcon className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Configuração de Carteiras</h1>
            <p className="text-gray-400">Gerencie os endereços Liquid para Depix, USDT e Bitcoin</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-4 rounded-xl mb-6 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" /><span>{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === t.id
                ? `bg-gradient-to-r ${t.color} text-black shadow-lg`
                : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Endereço */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-bitcoin/10 rounded-xl">
            {activeTab === 'btc' ? <Bitcoin className="w-6 h-6 text-yellow-400" /> : <Globe className="w-6 h-6 text-bitcoin" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Endereço Liquid — {current.label}</h2>
            <p className="text-gray-400 text-sm">Endereço que receberá os pagamentos em {current.assetName}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Endereço da Carteira {activeTab === 'depix' && <span className="text-red-400">*</span>}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={current.address}
                onChange={(e) => current.setAddress(e.target.value)}
                className="flex-1 p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white font-mono text-sm"
                placeholder={activeTab === 'depix' ? 'lq1qq...' : activeTab === 'usdt' ? 'Endereço USDT Liquid...' : 'Endereço L-BTC Liquid...'}
              />
              {current.address && (
                <button
                  onClick={() => copyToClipboard(current.address, activeTab)}
                  className="p-4 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-xl transition-colors"
                >
                  {copied === activeTab ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-bitcoin" />}
                </button>
              )}
            </div>
            {activeTab !== 'depix' && !current.address && (
              <p className="text-xs text-yellow-500 mt-2">
                Sem endereço = moeda desabilitada. Usuários não poderão selecionar {current.assetName}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Upload className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">QR Code — {current.label}</h2>
            <p className="text-gray-400 text-sm">Imagem PNG do QR Code para {current.assetName}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Upload do QR Code (PNG)</label>
            <input
              type="file"
              accept="image/png"
              onChange={(e) => current.setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-bitcoin/20 file:text-bitcoin hover:file:bg-bitcoin/30"
            />
          </div>

          {(current.file || current.qr) && (
            <div className="flex flex-col items-center bg-gray-900/50 rounded-xl p-6">
              <p className="text-sm text-gray-400 mb-4">Preview do QR Code:</p>
              <div className="bg-white p-4 rounded-2xl">
                <img 
                  src={current.file ? URL.createObjectURL(current.file) : current.qr} 
                  alt="QR Code Preview" 
                  className="w-48 h-48"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rate Lock */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-purple-500/10 rounded-xl">
            <Clock className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Rate Lock (Travamento de Cotação)</h2>
            <p className="text-gray-400 text-sm">Tempo de validade da cotação travada para USDT e BTC</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="number"
            min={1}
            max={60}
            value={rateLockMinutes}
            onChange={(e) => setRateLockMinutes(Math.max(1, Math.min(60, parseInt(e.target.value) || 10)))}
            className="w-24 p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none text-white text-center font-bold"
          />
          <span className="text-gray-400">minutos</span>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Após esse tempo, a cotação expira e o usuário deve criar um novo pagamento. Recomendado: 5-15 min.
        </p>
      </div>

      {/* Carteira Comercio (Colateral) */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-orange-500/10 rounded-xl">
            <Shield className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Carteira Comercio (Colateral)</h2>
            <p className="text-gray-400 text-sm">Carteira DePix para receber depositos iniciais e colaterais dos comerciantes</p>
          </div>
        </div>
        <input
          type="text"
          value={commerceWalletDepix}
          onChange={(e) => setCommerceWalletDepix(e.target.value)}
          placeholder="Endereco da carteira Liquid (DePix) para colaterais"
          className="w-full p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-white font-mono text-sm"
        />
        <p className="text-xs text-gray-500 mt-2">
          Se nao configurada, sera usada a carteira DePix principal. Esta carteira armazena colaterais e depositos iniciais.
        </p>
      </div>

      {/* Botao Salvar */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !walletAddress.trim()}
          className="px-8 py-4 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-2xl hover:shadow-bitcoin/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Salvando...</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> Salvar Todas as Configurações</>
          )}
        </button>
      </div>

      <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-300">
            <strong>Atenção:</strong> Ao alterar endereços ou QR Codes, todos os novos pagamentos usarão as novas informações.
            Pagamentos já criados mantêm as informações antigas.
          </p>
        </div>
      </div>
    </div>
  );
}

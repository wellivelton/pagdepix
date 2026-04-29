import { useState } from 'react';
import { 
  Wallet as WalletIcon, 
  Copy, 
  Check, 
  Globe,
  Shield,
  Info,
  AlertCircle
} from 'lucide-react';

const WALLET_ADDRESS = 'lq1qqgskhge4cunhw32799ky9wlaavt83xu0klvvz78yg4ugzr3dmq2t0gm4gyfdr59yhaq7anhkg52ha666d0nkys56jh979wyp7';

export default function WalletPage() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-bitcoin to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-bitcoin/20">
            <WalletIcon className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Carteira Liquid</h1>
            <p className="text-gray-400">Endereço para receber Depix (DPX)</p>
          </div>
        </div>
      </div>

      {/* Endereço da Carteira */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-bitcoin/10 rounded-xl">
            <Globe className="w-6 h-6 text-bitcoin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Endereço da Carteira</h2>
            <p className="text-gray-400 text-sm">Use este endereço para enviar Depix</p>
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-bitcoin font-mono text-sm break-all">
              {WALLET_ADDRESS}
            </code>
            <button
              onClick={() => copyToClipboard(WALLET_ADDRESS)}
              className="p-2 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg transition-colors"
              title="Copiar endereço"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-bitcoin" />}
            </button>
          </div>
        </div>

        {/* QR Code do Endereço */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-4 rounded-2xl mb-4">
            <img src="/qr-code.png" alt="QR Code da Carteira" className="w-64 h-64" />
          </div>
          <p className="text-sm text-gray-400 text-center">
            Escaneie o QR Code com sua carteira Liquid para copiar o endereço
          </p>
        </div>
      </div>

      {/* Informações Importantes */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Info className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Informações Importantes</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-bitcoin flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Rede Liquid Network</h3>
              <p className="text-gray-400 text-sm">
                Este endereço funciona apenas na rede Liquid Network. Não envie Depix de outras redes (Bitcoin, Ethereum, etc).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Envie apenas Depix (DPX)</h3>
              <p className="text-gray-400 text-sm">
                Este endereço aceita apenas Depix (DPX). Não envie Bitcoin, USDT ou outras criptomoedas.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Confirmações Rápidas</h3>
              <p className="text-gray-400 text-sm">
                Transações na Liquid Network são confirmadas rapidamente (1 confirmação geralmente é suficiente).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Valor Exato</h3>
              <p className="text-gray-400 text-sm">
                Ao pagar boletos, sempre envie o valor exato informado pelo sistema. Não envie valores diferentes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Como Usar */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
        <h2 className="text-xl font-bold text-white mb-6">Como usar esta carteira</h2>
        
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-bitcoin to-orange-500 text-black rounded-lg flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Ao pagar um boleto</h3>
              <p className="text-gray-400 text-sm">
                Quando você criar um boleto, o sistema gerará um valor exato em Depix. Use este endereço para enviar o pagamento.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-bitcoin to-orange-500 text-black rounded-lg flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Copie o endereço</h3>
              <p className="text-gray-400 text-sm">
                Clique no botão de copiar acima ou escaneie o QR Code com sua carteira Liquid compatível.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-bitcoin to-orange-500 text-black rounded-lg flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Envie o valor exato</h3>
              <p className="text-gray-400 text-sm">
                Envie exatamente o valor informado pelo sistema. Após o envio, copie o TXID da transação e adicione no histórico.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-bitcoin to-orange-500 text-black rounded-lg flex items-center justify-center font-bold">
              4
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Aguarde confirmação</h3>
              <p className="text-gray-400 text-sm">
                Nossa equipe verificará manualmente o pagamento e você receberá o comprovante após a aprovação.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

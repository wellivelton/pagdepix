import { useNavigate } from 'react-router-dom';
import { Send, QrCode, ArrowRight } from 'lucide-react';

export default function AreaPix() {
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Área Pix</h1>
        <p className="text-gray-400 mt-1">Escolha como deseja usar o Pix:</p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => navigate('/enviar-pix')}
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-gray-800/60 to-gray-800/30 rounded-2xl border border-gray-700/50 hover:border-bitcoin/50 transition-all text-left group"
        >
          <div className="p-3 bg-bitcoin/10 rounded-xl group-hover:bg-bitcoin/20 transition-colors flex-shrink-0">
            <Send className="w-6 h-6 text-bitcoin" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">Enviar com chave Pix</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Envie Pix diretamente usando uma chave Pix (CPF, e-mail, telefone ou aleatória)
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-bitcoin transition-colors flex-shrink-0" />
        </button>

        <button
          onClick={() => navigate('/pix-copia-cola')}
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-gray-800/60 to-gray-800/30 rounded-2xl border border-gray-700/50 hover:border-green-500/50 transition-all text-left group"
        >
          <div className="p-3 bg-green-500/10 rounded-xl group-hover:bg-green-500/20 transition-colors flex-shrink-0">
            <QrCode className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">Pagar Pix Copia e Cola</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Pague qualquer boleto, fatura ou cobrança usando um código Pix copiado
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-green-400 transition-colors flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}

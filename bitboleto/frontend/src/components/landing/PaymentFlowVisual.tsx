import { Coins, ArrowRight, CheckCircle } from 'lucide-react';

/**
 * Fluxo visual animado: Cripto → PagDepix → Conta paga
 * Elemento puramente CSS/SVG, sem dependências externas.
 */
export default function PaymentFlowVisual() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex flex-col items-center gap-1.5">
        <div className="w-10 h-10 rounded-xl bg-bitcoin/10 border border-bitcoin/25
          flex items-center justify-center shadow-lg shadow-bitcoin/10 animate-pulse-slow">
          <Coins className="w-5 h-5 text-bitcoin" />
        </div>
        <span className="text-[9px] text-gray-500 font-medium text-center leading-tight">
          Depix<br />L-USDT · L-BTC
        </span>
      </div>

      <div className="flex flex-col items-center gap-0.5 pb-4">
        <div className="flex items-center gap-0.5">
          <div className="w-5 h-px bg-gradient-to-r from-bitcoin/50 to-bitcoin" />
          <ArrowRight className="w-3 h-3 text-bitcoin" />
        </div>
        <span className="text-[9px] text-gray-600">envia</span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="w-10 h-10 rounded-xl bg-gray-800 border border-[rgba(214,235,253,0.19)]
          flex items-center justify-center shadow-xl">
          <img
            src="/logo.png"
            alt="PagDepix"
            className="w-6 h-6 object-contain rounded-md"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <span className="text-[9px] text-gray-400 font-semibold">PagDepix</span>
      </div>

      <div className="flex flex-col items-center gap-0.5 pb-4">
        <div className="flex items-center gap-0.5">
          <div className="w-5 h-px bg-gradient-to-r from-gray-600 to-green-500" />
          <ArrowRight className="w-3 h-3 text-green-500" />
        </div>
        <span className="text-[9px] text-gray-600">liquida</span>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/25
          flex items-center justify-center shadow-lg shadow-green-500/10">
          <CheckCircle className="w-5 h-5 text-green-400" />
        </div>
        <span className="text-[9px] text-gray-500 font-medium text-center leading-tight">
          Boleto<br />Pago ✓
        </span>
      </div>
    </div>
  );
}

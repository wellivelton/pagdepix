import { BarChart3, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSimulator } from '../../hooks/useSimulator';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

export default function SimulatorCard() {
  const navigate = useNavigate();
  const {
    simulatorAmount,
    setSimulatorAmount,
    simulatorResult,
    simulatorLoading,
    simulatorError,
  } = useSimulator();

  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700/60 shadow-2xl md:p-8">
      <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-bitcoin" />
        Simule sua taxa agora
      </h3>

      <div className="space-y-5">
        {/* Input */}
        <div>
          <label
            htmlFor="simulator-amount"
            className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider"
          >
            Valor do boleto (R$)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold pointer-events-none">
              R$
            </span>
            <input
              id="simulator-amount"
              type="number"
              step="0.01"
              min="20"
              value={simulatorAmount}
              onChange={(e) => setSimulatorAmount(e.target.value)}
              placeholder="100,00"
              aria-invalid={!!simulatorError}
              aria-describedby={simulatorError ? 'sim-error' : undefined}
              className="w-full pl-10 pr-4 py-3 text-sm bg-gray-800/60 border border-gray-700 rounded-xl
                text-white placeholder-gray-600 transition-all
                focus:ring-2 focus:ring-bitcoin/30 focus:border-bitcoin focus-visible:outline-none"
            />
          </div>
          {simulatorError && (
            <p id="sim-error" className="mt-2 text-xs text-red-400 font-medium" role="alert">
              {simulatorError}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-600">Mínimo R$ 20,00</p>
        </div>

        {/* Loading */}
        {simulatorLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-bitcoin animate-spin" />
          </div>
        )}

        {/* Result */}
        {simulatorResult?.isValid && !simulatorLoading && (
          <div className="space-y-4 pt-4 border-t border-gray-800 animate-fade-in">
            <div className="bg-bitcoin/10 border border-bitcoin/25 rounded-xl p-3.5">
              <p className="text-xs text-gray-400 mb-0.5">Faixa aplicada</p>
              <p className="text-sm font-bold text-bitcoin">
                {simulatorResult.taxRule?.description || 'Taxa inteligente'}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Valor do boleto</span>
                <span className="font-bold">
                  R$ {parseFloat(simulatorAmount).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Taxa ({simulatorResult.percentageFormatted})</span>
                <span className="font-bold text-bitcoin">
                  R$ {simulatorResult.fee.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Taxa fixa</span>
                <span>R$ {simulatorResult.fixedFee.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="border-t border-gray-800 pt-2 flex justify-between font-bold">
                <span className="text-white">Total em DPX</span>
                <span className="text-bitcoin">
                  {simulatorResult.totalAmount.toFixed(2).replace('.', ',')} DPX
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder */}
        {!simulatorResult && !simulatorLoading && !simulatorError && (
          <div className="text-xs text-gray-600 text-center py-4">
            Digite um valor para simular
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => navigate('/login')}
          aria-label="Acessar plataforma"
          className={`w-full py-3.5 text-sm font-bold rounded-xl
            bg-gradient-to-r from-bitcoin to-orange-500 text-black
            hover:shadow-lg hover:shadow-bitcoin/30 hover:-translate-y-0.5
            transition-all duration-200 ${focusRing}`}
        >
          Começar a operar
        </button>
      </div>
    </div>
  );
}

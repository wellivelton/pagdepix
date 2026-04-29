import { useState, useEffect } from 'react';
import api from '../services/api';

export type Currency = 'DEPIX' | 'USDT' | 'BTC';

interface CurrencySelectorProps {
  value: Currency;
  onChange: (c: Currency) => void;
  disabled?: boolean;
}

const CURRENCIES: { id: Currency; label: string; symbol: string; color: string }[] = [
  { id: 'DEPIX', label: 'Depix (DPX)', symbol: 'DPX', color: 'border-orange-500 bg-orange-500/10 text-orange-400' },
  { id: 'USDT', label: 'USDT (Liquid)', symbol: 'USDT', color: 'border-green-500 bg-green-500/10 text-green-400' },
  { id: 'BTC', label: 'Bitcoin (L-BTC)', symbol: 'sats', color: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
];

export function CurrencySelector({ value, onChange, disabled }: CurrencySelectorProps) {
  const [available, setAvailable] = useState<Set<Currency>>(new Set(['DEPIX']));
  const [rates, setRates] = useState<{ usdBrl?: number; btcBrl?: number } | null>(null);

  useEffect(() => {
    api.get('/rates').then(res => {
      setRates(res.data);
      const avail = new Set<Currency>(['DEPIX']);
      if (res.data.usdBrl) avail.add('USDT');
      if (res.data.btcBrl) avail.add('BTC');
      setAvailable(avail);
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-400">Moeda de pagamento</label>
      <div className="grid grid-cols-3 gap-2">
        {CURRENCIES.map(c => {
          const isAvail = available.has(c.id);
          const isSelected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled || !isAvail}
              onClick={() => onChange(c.id)}
              className={`p-2.5 md:p-3 rounded-lg md:rounded-xl border text-xs md:text-sm font-medium transition-all ${
                isSelected
                  ? c.color + ' ring-1 ring-current'
                  : isAvail
                    ? 'border-gray-600 bg-gray-900/50 text-gray-400 hover:border-gray-500'
                    : 'border-gray-700 bg-gray-900/30 text-gray-600 opacity-50 cursor-not-allowed'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {rates && value !== 'DEPIX' && (
        <p className="text-xs text-gray-500">
          Cotação: {value === 'USDT'
            ? `1 USD = R$ ${rates.usdBrl?.toFixed(2).replace('.', ',')}`
            : `1 BTC = R$ ${rates.btcBrl?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          }
        </p>
      )}
    </div>
  );
}

export function getCurrencyLabel(currency: string): string {
  return CURRENCIES.find(c => c.id === currency)?.label || currency;
}

export function formatCryptoAmount(currency: string, cryptoAmount: string | number | null): string {
  if (!cryptoAmount) return '';
  if (currency === 'USDT') return `${cryptoAmount} USDT`;
  if (currency === 'BTC') return `${Number(cryptoAmount).toLocaleString('pt-BR')} sats`;
  return `${cryptoAmount} DPX`;
}

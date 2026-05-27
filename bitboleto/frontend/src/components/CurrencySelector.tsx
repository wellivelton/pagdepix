import { useState, useEffect } from 'react';
import api from '../services/api';

export type Currency = 'DEPIX' | 'USDT' | 'BTC';

interface CurrencySelectorProps {
  value: Currency;
  onChange: (c: Currency) => void;
  disabled?: boolean;
}

const CURRENCIES: {
  id: Currency;
  label: string;
  sublabel: string;
  symbol: string;
  icon: string;
  color: string;
  activeRing: string;
}[] = [
  {
    id: 'DEPIX',
    label: 'Depix',
    sublabel: 'Liquid Network',
    symbol: 'DPX',
    icon: '/crypto/depix.svg',
    color: 'border-orange-500 bg-orange-500/10 text-orange-300',
    activeRing: 'ring-orange-500/60',
  },
  {
    id: 'USDT',
    label: 'USDT',
    sublabel: 'Liquid Network',
    symbol: 'USDT',
    icon: '/crypto/usdt.svg',
    color: 'border-green-500 bg-green-500/10 text-green-300',
    activeRing: 'ring-green-500/60',
  },
  {
    id: 'BTC',
    label: 'L-BTC',
    sublabel: 'Liquid Network',
    symbol: 'sats',
    icon: '/crypto/bitcoin.svg',
    color: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
    activeRing: 'ring-yellow-500/60',
  },
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
      <label className="block text-sm font-medium text-app-muted">Moeda de pagamento</label>
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
              className={`
                relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border
                text-xs font-medium transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface
                ${isSelected
                  ? `${c.color} ring-1 ${c.activeRing} shadow-sm`
                  : isAvail
                    ? 'border-app-stroke bg-app-elevated text-app-muted hover:border-app-stroke/80 hover:bg-app-surface hover:text-app-text'
                    : 'border-app-stroke/40 bg-app-elevated/50 text-app-subtle opacity-40 cursor-not-allowed'
                }
              `}
            >
              <img
                src={c.icon}
                alt={c.label}
                className={`w-7 h-7 object-contain transition-opacity ${!isAvail ? 'opacity-30' : ''}`}
                loading="eager"
                draggable={false}
              />
              <span className="font-semibold text-[13px] leading-none">{c.label}</span>
              <span className={`text-[10px] leading-none ${isSelected ? 'opacity-80' : 'text-app-subtle'}`}>
                {c.sublabel}
              </span>
            </button>
          );
        })}
      </div>
      {rates && value !== 'DEPIX' && (
        <p className="text-[11px] text-app-subtle">
          Cotação:{' '}
          {value === 'USDT'
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

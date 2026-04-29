import { useState, useEffect } from 'react';
import axios from 'axios';

export interface SimulatorResult {
  isValid: boolean;
  error?: string;
  taxRule?: { description: string };
  percentageFormatted: string;
  fee: number;
  fixedFee: number;
  totalAmount: number;
}

function getApiBase(): string {
  const url =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.PROD
      ? typeof window !== 'undefined'
        ? window.location.origin
        : ''
      : 'http://localhost:3001');
  return url.endsWith('/api') ? url : `${url.replace(/\/$/, '')}/api`;
}

export function useSimulator() {
  const [simulatorAmount, setSimulatorAmount] = useState('');
  const [simulatorResult, setSimulatorResult] = useState<SimulatorResult | null>(null);
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [simulatorError, setSimulatorError] = useState('');

  useEffect(() => {
    const calculate = async (amount: string) => {
      const parsed = parseFloat(amount);

      if (!amount || parsed < 20) {
        setSimulatorResult(null);
        setSimulatorError(parsed > 0 && parsed < 20 ? 'Valor mínimo é R$ 20,00' : '');
        return;
      }

      setSimulatorLoading(true);
      setSimulatorError('');

      try {
        const { data } = await axios.post<SimulatorResult>(`${getApiBase()}/boleto/simulate`, {
          amount: parsed,
        });

        if (data.isValid) {
          setSimulatorResult(data);
        } else {
          setSimulatorResult(null);
          setSimulatorError(data.error || 'Erro ao calcular');
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setSimulatorResult(null);
        setSimulatorError(axiosErr.response?.data?.error || 'Erro ao calcular taxa');
      } finally {
        setSimulatorLoading(false);
      }
    };

    const timeout = setTimeout(() => {
      if (simulatorAmount) {
        calculate(simulatorAmount);
      } else {
        setSimulatorResult(null);
        setSimulatorError('');
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [simulatorAmount]);

  return {
    simulatorAmount,
    setSimulatorAmount,
    simulatorResult,
    simulatorLoading,
    simulatorError,
  };
}

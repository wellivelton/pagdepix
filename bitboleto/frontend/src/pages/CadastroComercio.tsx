/**
 * Cadastro de comerciante (Modo Comercio) -- fluxo em etapas com CNPJ obrigatorio.
 * Etapas: nome -> CNPJ + nome do negocio -> email, telegram, senha, tipo de negocio.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Store,
  User,
  Building2,
  Mail,
  MessageCircle,
  Lock,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Briefcase,
  Shield,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import { isValidCNPJ, formatCNPJ } from '../utils/cpfCnpj';
import api from '../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

const TIPOS_NEGOCIO = [
  'Lanchonete / Restaurante',
  'Comercio varejista',
  'Servicos gerais',
  'Bar / Cantina',
  'Salao de beleza',
  'Oficina',
  'Food truck',
  'Loja de roupas',
  'Farmacia / Drogaria',
  'Outro',
];

const inputClass = `w-full pl-10 pr-3 py-2.5 md:py-3 bg-gray-900/50 rounded-lg md:rounded-xl border border-gray-600 text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all text-xs md:text-base ${focusRing}`;
const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400 pointer-events-none';

export default function CadastroComercio() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [docError, setDocError] = useState('');
  const [form, setForm] = useState({
    nome: '',
    sobrenome: '',
    cnpj: '',
    businessName: '',
    email: '',
    telegram: '',
    password: '',
    tipoNegocio: '',
    tipoNegocioOutro: '',
  });

  const handleChange = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
    if (field === 'cnpj') {
      setForm((p) => ({ ...p, cnpj: value.replace(/\D/g, '').slice(0, 14) }));
      setDocError('');
    }
  };

  const canStep1 = form.nome.trim().length >= 2 && form.sobrenome.trim().length >= 2;
  const cnpjValido = isValidCNPJ(form.cnpj);
  const canStep2 = cnpjValido && form.businessName.trim().length >= 2;
  const canStep3 =
    form.email.trim() &&
    form.telegram.trim() &&
    form.password.length >= 6 &&
    (form.tipoNegocio === 'Outro' ? form.tipoNegocioOutro.trim() : form.tipoNegocio);

  const goStep2 = () => {
    if (!canStep1) return;
    setStep(2);
  };

  const goStep3 = () => {
    if (!isValidCNPJ(form.cnpj)) {
      setDocError('CNPJ invalido. Verifique os digitos.');
      return;
    }
    if (form.businessName.trim().length < 2) {
      setDocError('Nome do negocio e obrigatorio.');
      return;
    }
    setDocError('');
    setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        cnpj: form.cnpj.replace(/\D/g, ''),
        businessName: form.businessName.trim(),
        email: form.email.trim(),
        telegram: form.telegram.trim().replace(/^@/, ''),
        password: form.password,
        tipoNegocio: form.tipoNegocio === 'Outro' ? form.tipoNegocioOutro.trim() : form.tipoNegocio,
      };
      await api.post('/commerce/register', payload);
      navigate('/login', { state: { cadastroComercioOk: true }, replace: true });
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 501) {
        setError('Cadastro de comerciante em breve. Tente novamente mais tarde.');
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao enviar cadastro.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <PublicHeader currentPage="comercio" />
      <main id="main-content" className="max-w-md mx-auto px-4 py-4 md:py-8">
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl font-bold text-white mb-1 md:text-2xl">Cadastro como comerciante</h1>
          <p className="text-gray-400 text-xs md:text-sm">
            {step === 1 && 'Nome do proprietario'}
            {step === 2 && 'CNPJ e nome do negocio'}
            {step === 3 && 'Email, Telegram e tipo de negocio'}
          </p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-300 text-xs">
              Exigimos CNPJ ativo na Receita Federal. Após o cadastro, será necessário um depósito de R$ 5,00 para validar a titularidade bancária (o valor é creditado como colateral).
            </p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
          {error && (
            <div className="mb-3 md:mb-4 p-2.5 md:p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs md:text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-3 md:space-y-4">
                <div className="relative">
                  <User className={iconClass} />
                  <input
                    type="text"
                    placeholder="Nome"
                    value={form.nome}
                    onChange={(e) => handleChange('nome', e.target.value)}
                    className={inputClass}
                    autoComplete="given-name"
                  />
                </div>
                <div className="relative">
                  <User className={iconClass} />
                  <input
                    type="text"
                    placeholder="Sobrenome"
                    value={form.sobrenome}
                    onChange={(e) => handleChange('sobrenome', e.target.value)}
                    className={inputClass}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={goStep2}
                disabled={!canStep1}
                className={`w-full mt-4 flex items-center justify-center gap-1.5 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-xs md:text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              {docError && <p className="text-red-400 text-xs mb-2 md:mb-3">{docError}</p>}
              <div className="space-y-3 md:space-y-4">
                <div className="relative">
                  <Building2 className={iconClass} />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={formatCNPJ(form.cnpj)}
                    onChange={(e) => handleChange('cnpj', e.target.value)}
                    className={inputClass}
                    maxLength={18}
                  />
                </div>
                <div className="relative">
                  <Briefcase className={iconClass} />
                  <input
                    type="text"
                    placeholder="Nome do negocio"
                    value={form.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                    className={inputClass}
                    maxLength={100}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4 md:mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-gray-600 text-gray-300 text-xs md:text-base font-medium ${focusRing}`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={goStep3}
                  disabled={!canStep2}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-xs md:text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
                >
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
              <div className="relative">
                <Mail className={iconClass} />
                <input
                  type="email"
                  placeholder="E-mail"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className={inputClass}
                  autoComplete="email"
                />
              </div>
              <div className="relative">
                <MessageCircle className={iconClass} />
                <input
                  type="text"
                  placeholder="@ Telegram (ex: @seuusuario)"
                  value={form.telegram}
                  onChange={(e) => handleChange('telegram', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  type="password"
                  placeholder="Senha (min. 6 caracteres)"
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1.5 md:mb-2">Tipo de negocio</label>
                <select
                  value={form.tipoNegocio}
                  onChange={(e) => handleChange('tipoNegocio', e.target.value)}
                  className={`${inputClass} pl-3 appearance-none bg-gray-900/50`}
                >
                  <option value="">Selecione</option>
                  {TIPOS_NEGOCIO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {form.tipoNegocio === 'Outro' && (
                  <input
                    type="text"
                    placeholder="Descreva seu modelo de negocio"
                    value={form.tipoNegocioOutro}
                    onChange={(e) => handleChange('tipoNegocioOutro', e.target.value)}
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-gray-600 text-gray-300 text-xs md:text-base font-medium ${focusRing}`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={!canStep3 || loading}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-xs md:text-base font-semibold disabled:opacity-50 ${focusRing}`}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                  {loading ? 'Validando CNPJ...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-center">
          <Link to="/login" className="text-xs md:text-sm text-bitcoin hover:underline">
            Ja tem conta? Fazer login
          </Link>
        </p>
      </main>

      <footer className="border-t border-gray-800 mt-8 md:mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400">PagDepix 2026.</div>
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  ArrowLeft,
  Phone,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import api from '../services/api';
import StepProgress from '../components/auth/StepProgress';
import CodeInput from '../components/auth/CodeInput';
import PasswordStrength from '../components/auth/PasswordStrength';
import WizardStep from '../components/auth/WizardStep';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type CadastroStep = 'name' | 'email' | 'code' | 'whatsapp' | 'password';

const STEPS: CadastroStep[] = ['name', 'email', 'code', 'whatsapp', 'password'];

// Validação client-side (formato apenas - backend faz validação completa)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
const NAME_MIN_PARTS = 2;
const NAME_MIN_LENGTH = 2;

function validateNameClient(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Nome é obrigatório' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < NAME_MIN_PARTS) return { valid: false, error: 'Digite nome e sobrenome' };
  if (parts.some((p) => p.length < NAME_MIN_LENGTH))
    return { valid: false, error: 'Cada parte deve ter pelo menos 2 letras' };
  return { valid: true };
}

function validateEmailClient(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { valid: false, error: 'E-mail é obrigatório' };
  if (!EMAIL_REGEX.test(trimmed)) return { valid: false, error: 'Formato de e-mail inválido' };
  return { valid: true };
}

function validateWhatsAppClient(whatsapp: string): { valid: boolean; error?: string } {
  const digits = whatsapp.replace(/\D/g, '');
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;
  if (withoutCountry.length < 10 || withoutCountry.length > 11) {
    return { valid: false, error: 'Informe DDD + número (ex: 11 99999-9999)' };
  }
  if (withoutCountry.length === 11 && withoutCountry[2] !== '9') {
    return { valid: false, error: 'Celular deve começar com 9 após o DDD' };
  }
  return { valid: true };
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectAfter = (location.state as { redirectAfter?: string } | null)?.redirectAfter;
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maintenanceActive, setMaintenanceActive] = useState<boolean | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('');

  const [cadastroStep, setCadastroStep] = useState<CadastroStep>('name');
  const [nameValid, setNameValid] = useState(false);
  const [emailValid, setEmailValid] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [whatsappValid, setWhatsappValid] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [validatingField, setValidatingField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    telegram: '',
    whatsapp: '',
    verificationCode: '',
    password: '',
    confirmPassword: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Capturar código de indicação da URL (?ref=CODIGO)
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('pagdepix_ref', ref.toUpperCase());
      // Se vier de link de indicação, abrir cadastro automaticamente
      setIsLogin(false);
    }

    api
      .get('/maintenance/status')
      .then(({ data }) => {
        setMaintenanceActive(data.active);
        setMaintenanceMessage(data.message || 'Sistema em manutenção. Tente novamente em breve.');
      })
      .catch(() => setMaintenanceActive(false));
  }, []);

  const showMaintenance = maintenanceActive === true;
  const message = maintenanceMessage || 'Sistema em manutenção. Tente novamente em breve.';

  const currentStepIndex = STEPS.indexOf(cadastroStep) + 1;
  const totalSteps = STEPS.length;

  const inputClass = `w-full pl-11 pr-4 py-3.5 sm:py-4 bg-gray-900/50 rounded-xl border border-gray-600 text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all text-base ${focusRing}`;
  const iconClass =
    'absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none group-focus-within:text-bitcoin transition-colors';

  const handleValidateName = async () => {
    setError('');
    setFieldErrors((e) => ({ ...e, name: '' }));
    const clientCheck = validateNameClient(formData.name);
    if (!clientCheck.valid) {
      setFieldErrors((e) => ({ ...e, name: clientCheck.error || '' }));
      return;
    }
    setValidatingField('name');
    try {
      const { data } = await api.post('/auth/register/validate-name', { name: formData.name });
      if (data.valid) {
        setNameValid(true);
        setCadastroStep('email');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Nome inválido';
      setFieldErrors((e) => ({ ...e, name: msg }));
    } finally {
      setValidatingField(null);
    }
  };

  const handleSendCode = async () => {
    setError('');
    setFieldErrors((e) => ({ ...e, email: '' }));
    const clientCheck = validateEmailClient(formData.email);
    if (!clientCheck.valid) {
      setFieldErrors((e) => ({ ...e, email: clientCheck.error || '' }));
      return;
    }
    setSendingCode(true);
    try {
      const validateRes = await api.post('/auth/register/validate-email', { email: formData.email });
      if (!validateRes.data.valid) {
        setFieldErrors((e) => ({ ...e, email: 'Este e-mail já está cadastrado' }));
        return;
      }
      const sendRes = await api.post('/auth/register/send-email-code', { email: formData.email });
      if (sendRes.data.success) {
        setEmailValid(true);
        setCadastroStep('code');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao enviar código';
      setFieldErrors((e) => ({ ...e, email: msg }));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setVerifyingCode(true);
    try {
      const { data } = await api.post('/auth/register/verify-email-code', {
        email: formData.email,
        code: formData.verificationCode,
      });
      if (data.success) {
        setEmailVerified(true);
        setCadastroStep('whatsapp');
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Código incorreto ou expirado');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleValidateWhatsapp = async () => {
    setError('');
    setFieldErrors((e) => ({ ...e, whatsapp: '' }));
    const clientCheck = validateWhatsAppClient(formData.whatsapp);
    if (!clientCheck.valid) {
      setFieldErrors((e) => ({ ...e, whatsapp: clientCheck.error || '' }));
      return;
    }
    setValidatingField('whatsapp');
    try {
      const { data } = await api.post('/auth/register/validate-phone', { whatsapp: formData.whatsapp });
      if (data.valid) {
        setWhatsappValid(true);
        setFormData((prev) => ({ ...prev, whatsapp: data.normalized || prev.whatsapp }));
        setCadastroStep('password');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'WhatsApp inválido';
      setFieldErrors((e) => ({ ...e, whatsapp: msg }));
    } finally {
      setValidatingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : {
            name: formData.name,
            email: formData.email,
            telegram: formData.telegram || undefined,
            whatsapp: formData.whatsapp,
            password: formData.password,
            referralCode: localStorage.getItem('pagdepix_ref') || undefined,
          };

      const { data } = await api.post(endpoint, payload);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (!isLogin) localStorage.removeItem('pagdepix_ref');

      const u = data.user;
      if (u.role !== 'ADMIN' && (!u.emailVerified || !u.telegramVerified)) {
        navigate('/confirmar-conta', { state: redirectAfter ? { redirectAfter } : undefined });
        return;
      }
      navigate(redirectAfter || '/dashboard', { replace: true });
    } catch (err: unknown) {
      const errObj = err as { response?: { status?: number; data?: { message?: string; error?: string } } };
      if (errObj.response?.status === 503 && (errObj.response?.data as { maintenance?: boolean })?.maintenance) {
        navigate('/manutencao', { state: { message: errObj.response?.data?.message || 'Sistema em manutenção.' } });
        return;
      }
      setError(errObj.response?.data?.message || errObj.response?.data?.error || 'Erro ao processar requisição');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    setFieldErrors({});
    const idx = STEPS.indexOf(cadastroStep);
    if (idx > 0) return setCadastroStep(STEPS[idx - 1]);
  };

  const canSubmitCadastro =
    nameValid &&
    emailValid &&
    emailVerified &&
    whatsappValid &&
    formData.password.length >= 6 &&
    formData.password === formData.confirmPassword;

  const isNameStepValid = validateNameClient(formData.name).valid;
  const isEmailStepValid = validateEmailClient(formData.email).valid;
  // ========== LOGIN FORM ==========
  const loginForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative group">
        <Mail className={iconClass} />
        <input
          type="email"
          placeholder="seu@email.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={inputClass}
          required
        />
      </div>
      <div className="relative group">
        <Lock className={iconClass} />
        <input
          type="password"
          placeholder="Senha"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className={inputClass}
          required
        />
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className={`w-full inline-flex items-center justify-center gap-2 py-3.5 text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${focusRing}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Entrando...
          </>
        ) : (
          'Entrar'
        )}
      </button>
      <div className="text-center space-y-1">
        <Link to="/forgot-password" className="block text-sm text-gray-400 hover:text-bitcoin transition-colors">
          Esqueci minha senha
        </Link>
        <p className="text-gray-500 text-xs mt-2">
          Não tem conta?{' '}
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setCadastroStep('name');
              setNameValid(false);
              setEmailValid(false);
              setEmailVerified(false);
              setWhatsappValid(false);
              setFormData({ name: '', email: '', telegram: '', whatsapp: '', verificationCode: '', password: '', confirmPassword: '' });
              setError('');
              setFieldErrors({});
            }}
            className="text-bitcoin hover:underline"
          >
            Criar conta
          </button>
        </p>
      </div>
    </form>
  );

  // ========== CADASTRO WIZARD (um passo por vez) ==========
  const renderCadastroStep = () => {
    switch (cadastroStep) {
      case 'name':
        return (
          <WizardStep>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleValidateName();
              }}
              className="flex flex-col h-full min-h-0"
            >
              <div className="space-y-4 flex-1">
                <div className="relative group">
                  <User className={iconClass} />
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setFieldErrors((e) => ({ ...e, name: '' }));
                    }}
                    className={`${inputClass} ${fieldErrors.name ? 'border-red-500' : ''}`}
                    autoFocus
                  />
                  {nameValid && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                  )}
                </div>
                <p className="text-gray-400 text-sm">Digite seu nome completo, como no documento</p>
                {(fieldErrors.name || (formData.name && !validateNameClient(formData.name).valid)) && (
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {fieldErrors.name || validateNameClient(formData.name).error}
                  </p>
                )}
              </div>
              <div className="mt-6 pb-6">
                <button
                  type="submit"
                  disabled={validatingField === 'name' || !isNameStepValid}
                  className={`w-full py-3.5 text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ${focusRing}`}
                >
                  {validatingField === 'name' ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Continuar'
                  )}
                </button>
              </div>
            </form>
          </WizardStep>
        );

      case 'email':
        return (
          <WizardStep>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
              className="flex flex-col h-full min-h-0"
            >
              <div className="space-y-4 flex-1">
                <div className="relative group">
                  <Mail className={iconClass} />
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setEmailValid(false);
                      setFieldErrors((e) => ({ ...e, email: '' }));
                    }}
                    className={`${inputClass} ${fieldErrors.email ? 'border-red-500' : ''}`}
                    autoFocus
                  />
                  {emailVerified && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                  )}
                </div>
                {fieldErrors.email && (
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {fieldErrors.email}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={sendingCode || !isEmailStepValid}
                  className={`w-full py-3 rounded-xl font-medium text-sm bg-gradient-to-r from-bitcoin to-orange-500 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ${focusRing}`}
                >
                  {sendingCode ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'Enviar código de verificação'
                  )}
                </button>
              </div>
              <div className="mt-6 pb-6">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Voltar
                </button>
              </div>
            </form>
          </WizardStep>
        );

      case 'code':
        return (
          <WizardStep>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCode();
              }}
              className="flex flex-col h-full min-h-0"
            >
              <div className="space-y-4 flex-1">
                <p className="text-gray-400 text-sm text-center">Enviamos um código para seu e-mail</p>
                <CodeInput
                  value={formData.verificationCode}
                  onChange={(code) => setFormData({ ...formData, verificationCode: code })}
                  error={!!error}
                />
                {error && (
                  <p className="text-red-400 text-sm flex items-center gap-2 justify-center">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                )}
              </div>
              <div className="mt-6 pb-6 space-y-3">
                <button
                  type="submit"
                  disabled={verifyingCode || formData.verificationCode.length !== 6}
                  className={`w-full py-3.5 text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ${focusRing}`}
                >
                  {verifyingCode ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Verificar código'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Voltar
                </button>
              </div>
            </form>
          </WizardStep>
        );

      case 'whatsapp':
        return (
          <WizardStep>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleValidateWhatsapp();
              }}
              className="flex flex-col h-full min-h-0"
            >
              <div className="space-y-4 flex-1">
                <p className="text-gray-400 text-sm">Usaremos seu WhatsApp apenas para avisos importantes</p>
                <div className="flex">
                  <div className="flex items-center justify-center px-4 py-3.5 bg-gray-700 rounded-l-xl border border-r-0 border-gray-600 text-gray-300 font-medium text-sm">
                    +55
                  </div>
                  <div className="relative group flex-1">
                    <Phone className={iconClass} />
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="11 99999-9999"
                      value={(() => {
                        const raw = formData.whatsapp.replace(/^55/, '');
                        if (raw.length <= 2) return raw;
                        if (raw.length <= 7) return `${raw.slice(0, 2)} ${raw.slice(2)}`;
                        return `${raw.slice(0, 2)} ${raw.slice(2, 7)}-${raw.slice(7)}`;
                      })()}
                      onChange={(e) => {
                        let raw = e.target.value.replace(/\D/g, '');
                        if (raw.startsWith('55') && raw.length >= 12) raw = raw.slice(2);
                        const digits = raw.slice(0, 11);
                        setFormData({ ...formData, whatsapp: digits ? `55${digits}` : '' });
                        setFieldErrors((prev) => ({ ...prev, whatsapp: '' }));
                        setWhatsappValid(false);
                      }}
                      className={`${inputClass} rounded-l-none`}
                      autoFocus
                    />
                    {whatsappValid && (
                      <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                    )}
                  </div>
                </div>
                {fieldErrors.whatsapp ? (
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {fieldErrors.whatsapp}
                  </p>
                ) : formData.whatsapp && !validateWhatsAppClient(formData.whatsapp).valid ? (
                  <p className="text-yellow-400/70 text-xs">
                    {validateWhatsAppClient(formData.whatsapp).error}
                  </p>
                ) : formData.whatsapp && validateWhatsAppClient(formData.whatsapp).valid && !whatsappValid ? (
                  <p className="text-green-400/70 text-xs">Clique em Continuar para validar</p>
                ) : null}
              </div>
              <div className="mt-6 pb-6 space-y-3">
                <button
                  type="submit"
                  disabled={validatingField === 'whatsapp' || !validateWhatsAppClient(formData.whatsapp).valid}
                  className={`w-full py-3.5 text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ${focusRing}`}
                >
                  {validatingField === 'whatsapp' ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Continuar'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Voltar
                </button>
              </div>
            </form>
          </WizardStep>
        );

      case 'password':
        return (
          <WizardStep>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(e);
              }}
              className="flex flex-col h-full min-h-0"
            >
              <div className="space-y-4 flex-1">
                <div className="relative group">
                  <Lock className={iconClass} />
                  <input
                    type="password"
                    placeholder="Senha (mínimo 6 caracteres)"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      setFieldErrors((e) => ({ ...e, password: '' }));
                    }}
                    className={`${inputClass} ${fieldErrors.password ? 'border-red-500' : ''}`}
                    minLength={6}
                    autoFocus
                  />
                </div>
                <PasswordStrength password={formData.password} />
                <div className="relative group">
                  <Lock className={iconClass} />
                  <input
                    type="password"
                    placeholder="Confirmar senha"
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      setFieldErrors((e) => ({ ...e, password: '' }));
                    }}
                    className={`${inputClass} ${fieldErrors.password ? 'border-red-500' : ''}`}
                    minLength={6}
                  />
                </div>
                {fieldErrors.password && (
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {fieldErrors.password}
                  </p>
                )}
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    As senhas não coincidem
                  </p>
                )}
              </div>
              <div className="mt-6 pb-6 space-y-3">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl flex items-start gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !canSubmitCadastro}
                  className={`w-full py-3.5 text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all ${focusRing}`}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Criar conta'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Voltar
                </button>
              </div>
            </form>
          </WizardStep>
        );

      default:
        return null;
    }
  };

  const cadastroForm = (
    <div className="flex flex-col min-h-0" style={{ minHeight: 'min(100vh - 280px, 400px)' }}>
      <StepProgress current={currentStepIndex} total={totalSteps} />
      {renderCadastroStep()}
    </div>
  );

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col">
        <div className="text-center mb-6">
          <Link to="/" aria-label="PagDepix - Página inicial">
            <img src="/logo.png" alt="PagDepix" className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-xl object-contain mb-3" />
          </Link>
          <p className="text-gray-400 text-sm">Pague boletos com Depix na Liquid Network</p>
        </div>

        {showMaintenance && (
          <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl p-6 border border-amber-500/30 border-gray-700/50">
            <h2 className="text-lg font-bold text-white text-center mb-2">Sistema em manutenção</h2>
            <p className="text-gray-300 text-center text-sm mb-4">{message}</p>
            <Link to="/" className="block mt-4 text-center text-bitcoin hover:underline text-sm font-medium">
              Voltar ao início
            </Link>
          </div>
        )}

        {!showMaintenance && (
          <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl p-6 border border-gray-700/50 shadow-xl">
            <div className="flex gap-1.5 mb-6 bg-gray-900/50 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                }}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${focusRing} ${
                  isLogin ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black shadow-lg shadow-bitcoin/30' : 'text-gray-400 hover:text-white'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setCadastroStep('name');
                  setNameValid(false);
                  setEmailValid(false);
                  setEmailVerified(false);
                  setWhatsappValid(false);
                  setFormData({ name: '', email: '', telegram: '', whatsapp: '', verificationCode: '', password: '', confirmPassword: '' });
                  setError('');
                  setFieldErrors({});
                }}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${focusRing} ${
                  !isLogin ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black shadow-lg shadow-bitcoin/30' : 'text-gray-400 hover:text-white'
                }`}
              >
                Cadastrar
              </button>
            </div>

            {isLogin ? (
              loginForm
            ) : (
              <>
                <p className="text-center text-gray-400 text-xs mb-4">
                  Criar conta
                </p>
                {cadastroForm}
              </>
            )}
          </div>
        )}

        <p className="text-center text-gray-500 text-xs mt-6">Pagamentos seguros via Liquid Network</p>
      </div>
    </div>
  );
}

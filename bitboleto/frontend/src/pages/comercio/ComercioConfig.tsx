import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Upload,
  X,
  Check,
  Palette,
  Building2,
  Save,
  AlertCircle,
  Phone,
  FileText,
  ExternalLink,
  Eye,
  Link as LinkIcon,
  Wallet,
  Loader2,
  Bell,
  Store,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Pencil,
} from 'lucide-react';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const BASE_URL = window.location.origin;

type SettingsData = {
  businessName: string | null;
  cnpj: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  useCustomBranding: boolean;
  contactPhone: string | null;
  supportEmail: string | null;
  businessDescription: string | null;
  redirectUrl: string | null;
  faviconUrl: string | null;
  liquidWallet: string | null;
  emailNotificationsEnabled: boolean;
  storeSlug: string | null;
  showCnpjOnStore: boolean;
  showPhoneOnStore: boolean;
  showEmailOnStore: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
};

const DEFAULT_SETTINGS: SettingsData = {
  businessName: null, cnpj: null, logoUrl: null,
  primaryColor: null, accentColor: null, backgroundColor: null, textColor: null,
  useCustomBranding: false, contactPhone: null, supportEmail: null,
  businessDescription: null, redirectUrl: null, faviconUrl: null,
  liquidWallet: null, emailNotificationsEnabled: true,
  storeSlug: null, showCnpjOnStore: false, showPhoneOnStore: false,
  showEmailOnStore: false, onboardingCompleted: false, onboardingStep: 0,
};

const WIZARD_STEPS = [
  { label: 'Nome da Loja', icon: Store },
  { label: 'Identidade Legal', icon: Building2 },
  { label: 'Contato', icon: Phone },
  { label: 'Descrição', icon: FileText },
  { label: 'Visual', icon: Palette },
  { label: 'Pós-pagamento', icon: ExternalLink },
  { label: 'Carteira', icon: Wallet },
  { label: 'Notificações', icon: Bell },
] as const;

function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let size = digits.length - 2;
  let numbers = digits.substring(0, size);
  const dv = digits.substring(size);
  let sum = 0; let pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(dv.charAt(0))) return false;
  size += 1; numbers = digits.substring(0, size); sum = 0; pos = size - 7;
  for (let i = size; i >= 1; i--) { sum += parseInt(numbers.charAt(size - i)) * pos--; if (pos < 2) pos = 9; }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(dv.charAt(1));
}

function compressImage(file: File, maxWidth = 512, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Erro canvas')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Erro blob')); return; }
          resolve(new File([blob], file.name, { type: file.type }));
        }, file.type, quality);
      };
      img.onerror = () => reject(new Error('Erro imagem'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro leitura'));
    reader.readAsDataURL(file);
  });
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-bitcoin' : 'bg-gray-700'} ${focusRing}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}

export default function ComercioConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [formData, setFormData] = useState<SettingsData>(DEFAULT_SETTINGS);

  // Wizard state
  const [wizardMode, setWizardMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Logo/favicon state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const logoPreviewRef = useRef<string | null>(null);
  const faviconPreviewRef = useRef<string | null>(null);
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const [faviconMode, setFaviconMode] = useState<'upload' | 'url'>('upload');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // Wallet state
  const [editingWallet, setEditingWallet] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [savingWallet, setSavingWallet] = useState(false);

  // Slug state
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit mode (card-based for completed onboarding)
  const [editingSection, setEditingSection] = useState<string | null>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<{ settings: SettingsData }>('/commerce/settings');
      const loaded: SettingsData = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      setSettings(loaded);
      setFormData(loaded);
      setWalletInput(loaded.liquidWallet || '');
      setEditingWallet(!loaded.liquidWallet);
      logoPreviewRef.current = loaded.logoUrl;
      faviconPreviewRef.current = loaded.faviconUrl;
      if (loaded.logoUrl && !loaded.logoUrl.startsWith('/uploads/')) setLogoMode('url');
      if (loaded.faviconUrl && !loaded.faviconUrl.startsWith('/uploads/')) setFaviconMode('url');
      if (!loaded.onboardingCompleted) {
        setWizardMode(true);
        setCurrentStep(Math.max(1, Math.min(8, loaded.onboardingStep || 1)));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const set = (field: keyof SettingsData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const saveSettings = useCallback(async (data: Partial<SettingsData>) => {
    setSaving(true);
    setError(null);
    try {
      const { data: res } = await api.put<{ settings: SettingsData }>('/commerce/settings', data);
      const updated = { ...DEFAULT_SETTINGS, ...res.settings };
      setSettings(updated);
      setFormData(updated);
      setWalletInput(updated.liquidWallet || '');
      return updated;
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao salvar');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Slug debounce check
  const checkSlug = useCallback((slug: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    setSlugAvailable(null);
    setSlugError(null);
    if (!slug.trim()) return;
    setSlugChecking(true);
    slugTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<{ available: boolean; reason?: string }>(`/commerce/slug/check/${slug.trim().toLowerCase()}`);
        setSlugAvailable(data.available);
        if (!data.available) setSlugError(data.reason || 'Slug já em uso');
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 500);
  }, []);

  const handleSlugChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    set('storeSlug', clean || null);
    checkSlug(clean);
  };

  // ---- Step advance/back ----
  const advanceStep = async () => {
    // Step 1: não avançar se slug está inválido ou indisponível
    if (currentStep === 1) {
      if (!formData.businessName?.trim()) {
        setError('Nome da loja é obrigatório.');
        return;
      }
      if (formData.storeSlug && slugAvailable === false) {
        setError(slugError || 'Endereço da loja já está em uso. Escolha outro.');
        return;
      }
    }

    const nextStep = currentStep + 1;
    try {
      await saveSettings({
        ...formData,
        onboardingStep: nextStep,
        onboardingCompleted: nextStep > 8,
      });
      if (nextStep > 8) {
        setWizardMode(false);
        setSuccess('Loja configurada com sucesso!');
      } else {
        setCurrentStep(nextStep);
      }
    } catch {}
  };

  const retreatStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings(formData);
      setSuccess('Configurações salvas!');
      setEditingSection(null);
    } catch {}
  };

  // ---- Logo upload ----
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      setError('Formato inválido. Use PNG, JPG ou SVG.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError('Arquivo muito grande. Máximo 5MB.'); return; }
    setUploadingLogo(true); setError(null);
    try {
      const toUpload = file.type.includes('svg') ? file : await compressImage(file, 512, 0.8);
      const reader = new FileReader();
      reader.onload = (ev) => { logoPreviewRef.current = ev.target?.result as string; };
      reader.readAsDataURL(toUpload);
      const fd = new FormData(); fd.append('logo', toUpload);
      const { data } = await api.post<{ logoUrl: string }>('/commerce/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set('logoUrl', data.logoUrl);
      setSettings((p) => ({ ...p, logoUrl: data.logoUrl }));
      logoPreviewRef.current = data.logoUrl;
      setLogoMode('upload');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro no upload da logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm('Remover logo?')) return;
    setUploadingLogo(true);
    try {
      await api.delete('/commerce/settings/logo');
      set('logoUrl', null); setSettings((p) => ({ ...p, logoUrl: null })); logoPreviewRef.current = null;
    } catch (err: any) { setError(err?.response?.data?.error || 'Erro ao remover logo');
    } finally { setUploadingLogo(false); }
  };

  const handleFaviconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(file.type)) {
      setError('Formato inválido. Use ICO ou PNG.'); return;
    }
    if (file.size > 1024 * 1024) { setError('Arquivo muito grande. Máximo 1MB.'); return; }
    setUploadingFavicon(true); setError(null);
    try {
      const fd = new FormData(); fd.append('favicon', file);
      const { data } = await api.post<{ faviconUrl: string }>('/commerce/settings/favicon', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      set('faviconUrl', data.faviconUrl);
      setSettings((p) => ({ ...p, faviconUrl: data.faviconUrl }));
      faviconPreviewRef.current = data.faviconUrl;
      setFaviconMode('upload');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro no upload do favicon');
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = '';
    }
  };

  const handleRemoveFavicon = async () => {
    if (!confirm('Remover favicon?')) return;
    setUploadingFavicon(true);
    try {
      await api.delete('/commerce/settings/favicon');
      set('faviconUrl', null); setSettings((p) => ({ ...p, faviconUrl: null })); faviconPreviewRef.current = null;
    } catch (err: any) { setError(err?.response?.data?.error || 'Erro ao remover favicon');
    } finally { setUploadingFavicon(false); }
  };

  // ---- Formatters ----
  const formatCNPJ = (v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
  };

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  };

  const cnpjDigits = formData.cnpj?.replace(/\D/g, '') || '';
  const cnpjValid = cnpjDigits.length === 0 || (cnpjDigits.length === 14 && validateCNPJ(cnpjDigits));

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-bitcoin" />
      </div>
    );
  }

  // ---- Status messages ----
  const StatusMsg = () => (error || success) ? (
    <div className={`rounded-xl p-3 border flex items-start gap-2 ${error ? 'bg-red-500/10 border-red-500/40' : 'bg-green-500/10 border-green-500/40'}`}>
      {error ? <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" /> : <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />}
      <p className={`text-sm ${error ? 'text-red-300' : 'text-green-300'}`}>{error || success}</p>
    </div>
  ) : null;

  // ==============================
  // WIZARD MODE
  // ==============================
  if (wizardMode) {
    const progressPct = Math.round(((currentStep - 1) / 8) * 100);

    const StepNav = ({ canAdvance = true }: { canAdvance?: boolean }) => (
      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={retreatStep}
          disabled={currentStep === 1}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-40 transition"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <span className="text-xs text-gray-500">{currentStep} / 8</span>
        <button
          type="button"
          onClick={advanceStep}
          disabled={saving || !canAdvance}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-bitcoin text-black text-sm font-semibold disabled:opacity-50 transition hover:bg-bitcoin/90"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {currentStep < 8 ? 'Salvar e continuar' : 'Concluir'}
          {!saving && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    );

    return (
      <div className="space-y-5 animate-fade-in">
        <StatusMsg />

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-medium">{WIZARD_STEPS[currentStep - 1].label}</span>
            <span>{progressPct}% concluído</span>
          </div>
          <div className="w-full bg-gray-700/50 rounded-full h-1.5">
            <div
              className="bg-bitcoin rounded-full h-1.5 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex gap-1.5 justify-center pt-1">
            {WIZARD_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentStep(i + 1)}
                className={`rounded-full transition-all ${
                  i + 1 === currentStep ? 'w-4 h-2 bg-bitcoin' :
                  i + 1 < currentStep ? 'w-2 h-2 bg-bitcoin/50' :
                  'w-2 h-2 bg-gray-600'
                }`}
                title={WIZARD_STEPS[i].label}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Nome da Loja */}
        {currentStep === 1 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Store className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Nome da Loja</h3>
                <p className="text-xs text-gray-400">Como sua loja será chamada</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Nome do Negócio *</label>
                <input
                  type="text"
                  value={formData.businessName || ''}
                  onChange={(e) => set('businessName', e.target.value)}
                  placeholder="Ex: Minha Loja Online"
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Slug da loja (URL única)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.storeSlug || ''}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="minha-loja"
                    maxLength={50}
                    className={`w-full px-3 py-2 pr-8 text-sm bg-gray-900/50 border rounded-lg text-white placeholder-gray-500 font-mono ${focusRing} ${
                      slugAvailable === true ? 'border-green-500' :
                      slugAvailable === false ? 'border-red-500' :
                      'border-gray-700'
                    }`}
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {slugChecking && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                    {!slugChecking && slugAvailable === true && <Check className="w-3.5 h-3.5 text-green-400" />}
                    {!slugChecking && slugAvailable === false && <X className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                </div>
                {slugError && <p className="mt-1 text-xs text-red-400">{slugError}</p>}
                {formData.storeSlug && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    URL: <span className="text-bitcoin font-mono">{BASE_URL}/loja/{formData.storeSlug}</span>
                  </p>
                )}
              </div>
            </div>
            <StepNav canAdvance={!!formData.businessName?.trim()} />
          </SectionCard>
        )}

        {/* Step 2: Identidade Legal */}
        {currentStep === 2 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Building2 className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Identidade Legal</h3>
                <p className="text-xs text-gray-400">CNPJ opcional</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">CNPJ</label>
                <input
                  type="text"
                  value={formData.cnpj ? formatCNPJ(formData.cnpj) : ''}
                  onChange={(e) => set('cnpj', e.target.value.replace(/\D/g, ''))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border ${cnpjDigits.length > 0 && !cnpjValid ? 'border-yellow-500' : 'border-gray-700'} rounded-lg text-white placeholder-gray-500 ${focusRing}`}
                />
                {cnpjDigits.length > 0 && !cnpjValid && <p className="mt-1 text-xs text-yellow-400">CNPJ inválido</p>}
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <div>
                  <p className="text-sm text-white">Exibir CNPJ na loja</p>
                  <p className="text-xs text-gray-500">Visível na página pública</p>
                </div>
                <Toggle value={formData.showCnpjOnStore} onChange={(v) => set('showCnpjOnStore', v)} />
              </div>
            </div>
            <StepNav />
          </SectionCard>
        )}

        {/* Step 3: Contato */}
        {currentStep === 3 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Phone className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Contato</h3>
                <p className="text-xs text-gray-400">Informações de contato da loja</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Telefone</label>
                <input
                  type="text"
                  value={formData.contactPhone ? formatPhone(formData.contactPhone) : ''}
                  onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, ''))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <p className="text-sm text-white">Exibir telefone na loja</p>
                <Toggle value={formData.showPhoneOnStore} onChange={(v) => set('showPhoneOnStore', v)} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">E-mail de suporte</label>
                <input
                  type="email"
                  value={formData.supportEmail || ''}
                  onChange={(e) => set('supportEmail', e.target.value)}
                  placeholder="suporte@exemplo.com"
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <p className="text-sm text-white">Exibir e-mail na loja</p>
                <Toggle value={formData.showEmailOnStore} onChange={(v) => set('showEmailOnStore', v)} />
              </div>
            </div>
            <StepNav />
          </SectionCard>
        )}

        {/* Step 4: Descrição */}
        {currentStep === 4 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><FileText className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Descrição</h3>
                <p className="text-xs text-gray-400">Usada como meta description SEO</p>
              </div>
            </div>
            <textarea
              value={formData.businessDescription || ''}
              onChange={(e) => set('businessDescription', e.target.value)}
              placeholder="Descreva seu negócio em poucas palavras..."
              rows={4}
              maxLength={300}
              className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 resize-none ${focusRing}`}
            />
            <p className="text-xs text-gray-500 text-right mt-1">{(formData.businessDescription?.length || 0)}/300</p>
            <StepNav />
          </SectionCard>
        )}

        {/* Step 5: Identidade Visual */}
        {currentStep === 5 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Palette className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Identidade Visual</h3>
                <p className="text-xs text-gray-400">Logo, favicon e cores</p>
              </div>
            </div>
            <div className="space-y-5">
              {/* Logo */}
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Logo (512×512px • PNG/JPG/SVG • máx 5MB)</p>
                <div className="flex gap-2 mb-2">
                  {['upload', 'url'].map((m) => (
                    <button key={m} type="button" onClick={() => setLogoMode(m as 'upload' | 'url')}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${logoMode === m ? 'bg-bitcoin text-black font-medium' : 'bg-gray-700/50 text-gray-400 hover:text-white'} ${focusRing}`}>
                      {m === 'upload' ? <><Upload className="w-3 h-3 inline mr-1" />Upload</> : <><LinkIcon className="w-3 h-3 inline mr-1" />URL</>}
                    </button>
                  ))}
                </div>
                {logoMode === 'upload' ? (
                  <div className="flex items-center gap-3">
                    {(logoPreviewRef.current || formData.logoUrl) && (
                      <div className="relative">
                        <div className="w-16 h-16 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center justify-center overflow-hidden">
                          <img src={logoPreviewRef.current || formData.logoUrl || ''} alt="Logo" className="max-w-full max-h-full object-contain" />
                        </div>
                        {formData.logoUrl && (
                          <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="absolute -top-1 -right-1 p-0.5 bg-red-500 hover:bg-red-600 rounded-full text-white">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <div>
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" onChange={handleLogoChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-50 ${focusRing}`}>
                        {uploadingLogo ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : <><Upload className="w-3 h-3" />{formData.logoUrl ? 'Substituir' : 'Enviar logo'}</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <input type="url" value={formData.logoUrl && !formData.logoUrl.startsWith('/uploads/') ? formData.logoUrl : ''}
                    onChange={(e) => { set('logoUrl', e.target.value); logoPreviewRef.current = e.target.value; }}
                    placeholder="https://exemplo.com/logo.png"
                    className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                )}
              </div>

              {/* Favicon */}
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Favicon (ICO/PNG • máx 1MB)</p>
                <div className="flex gap-2 mb-2">
                  {['upload', 'url'].map((m) => (
                    <button key={m} type="button" onClick={() => setFaviconMode(m as 'upload' | 'url')}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${faviconMode === m ? 'bg-bitcoin text-black font-medium' : 'bg-gray-700/50 text-gray-400 hover:text-white'} ${focusRing}`}>
                      {m === 'upload' ? 'Upload' : 'URL'}
                    </button>
                  ))}
                </div>
                {faviconMode === 'upload' ? (
                  <div className="flex items-center gap-3">
                    {(faviconPreviewRef.current || formData.faviconUrl) && (
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-900/50 rounded border border-gray-700 flex items-center justify-center overflow-hidden">
                          <img src={faviconPreviewRef.current || formData.faviconUrl || ''} alt="Favicon" className="max-w-full max-h-full object-contain" />
                        </div>
                        {formData.faviconUrl && (
                          <button type="button" onClick={handleRemoveFavicon} disabled={uploadingFavicon} className="absolute -top-1 -right-1 p-0.5 bg-red-500 hover:bg-red-600 rounded-full text-white">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <div>
                      <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon" onChange={handleFaviconChange} className="hidden" />
                      <button type="button" onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-50 ${focusRing}`}>
                        {uploadingFavicon ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : <><Upload className="w-3 h-3" />{formData.faviconUrl ? 'Substituir' : 'Enviar favicon'}</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <input type="url" value={formData.faviconUrl && !formData.faviconUrl.startsWith('/uploads/') ? formData.faviconUrl : ''}
                    onChange={(e) => { set('faviconUrl', e.target.value); faviconPreviewRef.current = e.target.value; }}
                    placeholder="https://exemplo.com/favicon.ico"
                    className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                )}
              </div>

              {/* Cores */}
              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Cores da marca</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { field: 'primaryColor' as const, label: 'Principal', default: '#FF6B00' },
                    { field: 'accentColor' as const, label: 'Destaque', default: '#FF9500' },
                    { field: 'backgroundColor' as const, label: 'Fundo', default: '#1F2937' },
                    { field: 'textColor' as const, label: 'Texto', default: '#FFFFFF' },
                  ].map(({ field, label, default: def }) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={formData[field] || def} onChange={(e) => set(field, e.target.value)} className="w-8 h-8 rounded border border-gray-700 cursor-pointer" />
                        <input type="text" value={formData[field] || ''} onChange={(e) => set(field, e.target.value)} placeholder={def}
                          className={`flex-1 px-2 py-1.5 text-xs bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 font-mono ${focusRing}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Toggle branding */}
              <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <div>
                  <p className="text-sm text-white">Usar identidade visual</p>
                  <p className="text-xs text-gray-500">{formData.useCustomBranding ? 'Logo e cores ativas' : 'Layout padrão'}</p>
                </div>
                <Toggle value={formData.useCustomBranding} onChange={(v) => set('useCustomBranding', v)} />
              </div>

              {/* Mini-preview */}
              {formData.useCustomBranding && (
                <div className="rounded-lg border border-gray-600 overflow-hidden" style={{ backgroundColor: formData.backgroundColor || '#1F2937', color: formData.textColor || '#FFF' }}>
                  <div className="p-3 space-y-2">
                    {formData.logoUrl && <div className="flex justify-center"><img src={logoPreviewRef.current || formData.logoUrl} alt="Logo" className="h-10 w-auto object-contain" /></div>}
                    <p className="text-center font-bold text-sm">{formData.businessName || 'Nome da Loja'}</p>
                    <button type="button" className="w-full py-1.5 rounded text-xs font-medium" style={{ backgroundColor: formData.primaryColor || '#FF6B00', color: '#000' }}>Pagar com Pix</button>
                  </div>
                </div>
              )}
            </div>
            <StepNav />
          </SectionCard>
        )}

        {/* Step 6: Pós-pagamento */}
        {currentStep === 6 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><ExternalLink className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">URL de Redirecionamento</h3>
                <p className="text-xs text-gray-400">Opcional — após pagamento confirmado</p>
              </div>
            </div>
            <input
              type="url"
              value={formData.redirectUrl || ''}
              onChange={(e) => set('redirectUrl', e.target.value)}
              placeholder="https://exemplo.com/obrigado"
              className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`}
            />
            <StepNav />
          </SectionCard>
        )}

        {/* Step 7: Carteira */}
        {currentStep === 7 && (
          <SectionCard>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs mb-4">
              <strong>Importante:</strong> O comerciante é o único responsável pelo endereço Liquid fornecido. O PagDepix é isento de qualquer responsabilidade por perdas causadas por erro de endereço ou perda de chaves.
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Wallet className="w-4 h-4 text-bitcoin" /></div>
              <div>
                <h3 className="font-bold text-white">Carteira Liquid</h3>
                <p className="text-xs text-gray-400">Necessária para receber pagamentos</p>
              </div>
            </div>

            {settings.liquidWallet && !editingWallet ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-0.5">Endereço salvo:</p>
                    <p className="text-xs text-white font-mono break-all">{settings.liquidWallet}</p>
                  </div>
                  <button type="button" onClick={() => { setEditingWallet(true); setWalletInput(settings.liquidWallet || ''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg text-xs font-medium transition">
                    <Settings className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  placeholder="Endereço da carteira Liquid (ex: lq1qq...)"
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border ${walletInput && walletInput.trim().length < 20 ? 'border-red-500/50' : 'border-gray-700'} rounded-lg text-white placeholder-gray-500 font-mono ${focusRing}`}
                />
                {walletInput && walletInput.trim().length < 20 && <p className="text-xs text-red-400">O endereço deve ter pelo menos 20 caracteres</p>}
                <button
                  type="button"
                  disabled={savingWallet || !walletInput.trim() || walletInput.trim().length < 20}
                  onClick={async () => {
                    const trimmed = walletInput.trim();
                    if (!trimmed || trimmed.length < 20) { setError('Endereço inválido'); return; }
                    setSavingWallet(true); setError(null);
                    try {
                      const updated = await saveSettings({ ...formData, liquidWallet: trimmed });
                      if (updated) { setWalletInput(updated.liquidWallet || ''); setEditingWallet(false); setSuccess('Carteira salva!'); }
                    } finally { setSavingWallet(false); }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-bitcoin hover:bg-bitcoin/90 text-black rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {savingWallet ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />{settings.liquidWallet ? 'Atualizar' : 'Salvar endereço'}</>}
                </button>
              </div>
            )}
            <StepNav canAdvance={!!settings.liquidWallet} />
          </SectionCard>
        )}

        {/* Step 8: Notificações */}
        {currentStep === 8 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-blue-500/10 rounded-lg"><Bell className="w-4 h-4 text-blue-400" /></div>
              <div>
                <h3 className="font-bold text-white">Notificações</h3>
                <p className="text-xs text-gray-400">Receber alertas de pagamentos por email</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
              <div>
                <p className="text-sm text-white">Notificações por email</p>
                <p className="text-xs text-gray-500">{formData.emailNotificationsEnabled ? 'Ativo — você será notificado' : 'Desativado'}</p>
              </div>
              <Toggle value={formData.emailNotificationsEnabled} onChange={(v) => set('emailNotificationsEnabled', v)} />
            </div>
            <StepNav />
          </SectionCard>
        )}
      </div>
    );
  }

  // ==============================
  // COMPLETION / CARD MODE
  // ==============================

  // Show completion banner if just finished
  const storeUrl = settings.storeSlug ? `${BASE_URL}/loja/${settings.storeSlug}` : null;

  const SectionHeader = ({
    icon: Icon, title, subtitle, sectionKey,
  }: { icon: React.ElementType; title: string; subtitle: string; sectionKey: string }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Icon className="w-4 h-4 text-bitcoin" /></div>
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      {editingSection !== sectionKey && (
        <button type="button" onClick={() => { setEditingSection(sectionKey); setError(null); setSuccess(null); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 transition">
          <Pencil className="w-3 h-3" /> Editar
        </button>
      )}
    </div>
  );

  const SaveCancel = () => (
    <div className="flex gap-2 mt-3">
      <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-bitcoin text-black text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-bitcoin/90 transition">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
      </button>
      <button type="button" onClick={() => { setEditingSection(null); setFormData(settings); }} className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition">Cancelar</button>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <StatusMsg />

      {/* Store URL banner */}
      {storeUrl && (
        <div className="p-3 rounded-xl bg-bitcoin/10 border border-bitcoin/30 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">Sua loja pública</p>
            <p className="text-sm text-bitcoin font-mono">{storeUrl}</p>
          </div>
          <a href={storeUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bitcoin text-black rounded-lg font-semibold hover:bg-bitcoin/90 transition">
            <Eye className="w-3.5 h-3.5" /> Ver loja
          </a>
        </div>
      )}

      {/* Reopen wizard */}
      <div className="flex justify-end">
        <button type="button" onClick={() => { setWizardMode(true); setCurrentStep(1); }}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition">
          <Settings className="w-3 h-3" /> Refazer configuração guiada
        </button>
      </div>

      {/* Section: Nome */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={Store} title="Nome da Loja" subtitle={settings.businessName || '—'} sectionKey="nome" />
          {editingSection === 'nome' && (
            <>
              <div className="space-y-3">
                <input type="text" value={formData.businessName || ''} onChange={(e) => set('businessName', e.target.value)} placeholder="Nome do negócio"
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Slug da loja</label>
                  <div className="relative">
                    <input type="text" value={formData.storeSlug || ''} onChange={(e) => handleSlugChange(e.target.value)} placeholder="minha-loja" maxLength={50}
                      className={`w-full px-3 py-2 pr-8 text-sm bg-gray-900/50 border rounded-lg text-white placeholder-gray-500 font-mono ${focusRing} ${slugAvailable === true ? 'border-green-500' : slugAvailable === false ? 'border-red-500' : 'border-gray-700'}`} />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {slugChecking && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                      {!slugChecking && slugAvailable === true && <Check className="w-3.5 h-3.5 text-green-400" />}
                      {!slugChecking && slugAvailable === false && <X className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                  </div>
                  {slugError && <p className="mt-1 text-xs text-red-400">{slugError}</p>}
                  {formData.storeSlug && <p className="mt-1 text-xs text-gray-500">URL: <span className="text-bitcoin font-mono">{BASE_URL}/loja/{formData.storeSlug}</span></p>}
                </div>
              </div>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Legal */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={Building2} title="Identidade Legal" subtitle={settings.cnpj ? formatCNPJ(settings.cnpj) : 'CNPJ não informado'} sectionKey="legal" />
          {editingSection === 'legal' && (
            <>
              <div className="space-y-3">
                <input type="text" value={formData.cnpj ? formatCNPJ(formData.cnpj) : ''} onChange={(e) => set('cnpj', e.target.value.replace(/\D/g, ''))}
                  placeholder="00.000.000/0000-00" maxLength={18}
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border ${cnpjDigits.length > 0 && !cnpjValid ? 'border-yellow-500' : 'border-gray-700'} rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                {cnpjDigits.length > 0 && !cnpjValid && <p className="text-xs text-yellow-400">CNPJ inválido</p>}
                <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                  <p className="text-sm text-white">Exibir CNPJ na loja</p>
                  <Toggle value={formData.showCnpjOnStore} onChange={(v) => set('showCnpjOnStore', v)} />
                </div>
              </div>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Contato */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={Phone} title="Contato" subtitle={[settings.contactPhone ? formatPhone(settings.contactPhone) : '', settings.supportEmail || ''].filter(Boolean).join(' • ') || '—'} sectionKey="contato" />
          {editingSection === 'contato' && (
            <>
              <div className="space-y-3">
                <input type="text" value={formData.contactPhone ? formatPhone(formData.contactPhone) : ''} onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, ''))}
                  placeholder="(00) 00000-0000" maxLength={15}
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                  <p className="text-sm text-white">Exibir telefone na loja</p>
                  <Toggle value={formData.showPhoneOnStore} onChange={(v) => set('showPhoneOnStore', v)} />
                </div>
                <input type="email" value={formData.supportEmail || ''} onChange={(e) => set('supportEmail', e.target.value)} placeholder="suporte@exemplo.com"
                  className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                  <p className="text-sm text-white">Exibir e-mail na loja</p>
                  <Toggle value={formData.showEmailOnStore} onChange={(v) => set('showEmailOnStore', v)} />
                </div>
              </div>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Descrição */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={FileText} title="Descrição" subtitle={settings.businessDescription ? `${settings.businessDescription.slice(0, 60)}…` : '—'} sectionKey="descricao" />
          {editingSection === 'descricao' && (
            <>
              <textarea value={formData.businessDescription || ''} onChange={(e) => set('businessDescription', e.target.value)} rows={3} maxLength={300}
                placeholder="Descreva seu negócio..."
                className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 resize-none ${focusRing}`} />
              <p className="text-xs text-gray-500 text-right mb-1">{(formData.businessDescription?.length || 0)}/300</p>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Visual */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={Palette} title="Identidade Visual" subtitle={settings.useCustomBranding ? 'Branding ativo' : 'Layout padrão'} sectionKey="visual" />
          {editingSection === 'visual' && (
            <>
              <div className="space-y-4">
                {/* Logo */}
                <div>
                  <p className="text-xs text-gray-400 mb-2">Logo (PNG/JPG/SVG • máx 5MB)</p>
                  <div className="flex gap-2 mb-2">
                    {['upload', 'url'].map((m) => (
                      <button key={m} type="button" onClick={() => setLogoMode(m as 'upload' | 'url')}
                        className={`px-3 py-1 text-xs rounded transition ${logoMode === m ? 'bg-bitcoin text-black font-medium' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}>
                        {m === 'upload' ? 'Upload' : 'URL'}
                      </button>
                    ))}
                  </div>
                  {logoMode === 'upload' ? (
                    <div className="flex items-center gap-3">
                      {(logoPreviewRef.current || formData.logoUrl) && (
                        <div className="relative">
                          <div className="w-14 h-14 bg-gray-900/50 rounded border border-gray-700 flex items-center justify-center overflow-hidden">
                            <img src={logoPreviewRef.current || formData.logoUrl || ''} alt="" className="max-w-full max-h-full object-contain" />
                          </div>
                          {formData.logoUrl && <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full text-white"><X className="w-2.5 h-2.5" /></button>}
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" onChange={handleLogoChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-50">
                        {uploadingLogo ? <><Loader2 className="w-3 h-3 animate-spin" />Enviando...</> : <><Upload className="w-3 h-3" />{formData.logoUrl ? 'Substituir' : 'Enviar'}</>}
                      </button>
                    </div>
                  ) : (
                    <input type="url" value={formData.logoUrl && !formData.logoUrl.startsWith('/uploads/') ? formData.logoUrl : ''}
                      onChange={(e) => { set('logoUrl', e.target.value); logoPreviewRef.current = e.target.value; }}
                      placeholder="https://exemplo.com/logo.png"
                      className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
                  )}
                </div>
                {/* Cores */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { field: 'primaryColor' as const, label: 'Principal', def: '#FF6B00' },
                    { field: 'accentColor' as const, label: 'Destaque', def: '#FF9500' },
                    { field: 'backgroundColor' as const, label: 'Fundo', def: '#1F2937' },
                    { field: 'textColor' as const, label: 'Texto', def: '#FFFFFF' },
                  ].map(({ field, label, def }) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={formData[field] || def} onChange={(e) => set(field, e.target.value)} className="w-7 h-7 rounded border border-gray-700 cursor-pointer" />
                        <input type="text" value={formData[field] || ''} onChange={(e) => set(field, e.target.value)} placeholder={def}
                          className={`flex-1 px-2 py-1 text-xs bg-gray-900/50 border border-gray-700 rounded text-white placeholder-gray-500 font-mono ${focusRing}`} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                  <div>
                    <p className="text-sm text-white">Usar identidade visual</p>
                    <p className="text-xs text-gray-500">{formData.useCustomBranding ? 'Ativo' : 'Desativado'}</p>
                  </div>
                  <Toggle value={formData.useCustomBranding} onChange={(v) => set('useCustomBranding', v)} />
                </div>
              </div>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Pós-pagamento */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={ExternalLink} title="URL Pós-pagamento" subtitle={settings.redirectUrl || '—'} sectionKey="redirect" />
          {editingSection === 'redirect' && (
            <>
              <input type="url" value={formData.redirectUrl || ''} onChange={(e) => set('redirectUrl', e.target.value)} placeholder="https://exemplo.com/obrigado"
                className={`w-full px-3 py-2 text-sm bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 ${focusRing}`} />
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Section: Carteira */}
      <SectionCard>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs mb-3">
          <strong>Importante:</strong> O comerciante é o único responsável pelo endereço Liquid fornecido. O PagDepix é isento de qualquer responsabilidade por perdas causadas por erro de endereço ou perda de chaves.
        </div>
        <SectionHeader icon={Wallet} title="Carteira Liquid" subtitle={settings.liquidWallet ? `${settings.liquidWallet.slice(0, 20)}…` : 'Não configurada'} sectionKey="carteira" />
        {settings.liquidWallet && !editingWallet ? (
          <div className="flex items-center gap-2 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Endereço:</p>
              <p className="text-xs text-white font-mono break-all">{settings.liquidWallet}</p>
            </div>
            <button type="button" onClick={() => { setEditingWallet(true); setWalletInput(settings.liquidWallet || ''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg text-xs font-medium transition">
              <Settings className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input type="text" value={walletInput} onChange={(e) => setWalletInput(e.target.value)} placeholder="lq1qq..."
              className={`w-full px-3 py-2 text-sm bg-gray-900/50 border ${walletInput && walletInput.trim().length < 20 ? 'border-red-500/50' : 'border-gray-700'} rounded-lg text-white placeholder-gray-500 font-mono ${focusRing}`} />
            {walletInput && walletInput.trim().length < 20 && <p className="text-xs text-red-400">Pelo menos 20 caracteres</p>}
            <div className="flex gap-2">
              <button type="button" disabled={savingWallet || !walletInput.trim() || walletInput.trim().length < 20}
                onClick={async () => {
                  const trimmed = walletInput.trim();
                  if (!trimmed || trimmed.length < 20) { setError('Endereço inválido'); return; }
                  setSavingWallet(true); setError(null);
                  try {
                    const updated = await saveSettings({ ...formData, liquidWallet: trimmed });
                    if (updated) { setWalletInput(updated.liquidWallet || ''); setEditingWallet(false); setSuccess('Carteira salva!'); }
                  } finally { setSavingWallet(false); }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-bitcoin hover:bg-bitcoin/90 text-black rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {savingWallet ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <><Save className="w-4 h-4" />{settings.liquidWallet ? 'Atualizar' : 'Salvar'}</>}
              </button>
              {settings.liquidWallet && (
                <button type="button" onClick={() => setEditingWallet(false)} className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition">Cancelar</button>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Section: Notificações */}
      <SectionCard>
        <form onSubmit={handleSaveSection}>
          <SectionHeader icon={Bell} title="Notificações" subtitle={settings.emailNotificationsEnabled ? 'Email ativo' : 'Desativado'} sectionKey="notif" />
          {editingSection === 'notif' && (
            <>
              <div className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg">
                <div>
                  <p className="text-sm text-white">Notificações por email</p>
                  <p className="text-xs text-gray-500">{formData.emailNotificationsEnabled ? 'Ativo' : 'Desativado'}</p>
                </div>
                <Toggle value={formData.emailNotificationsEnabled} onChange={(v) => set('emailNotificationsEnabled', v)} />
              </div>
              <SaveCancel />
            </>
          )}
        </form>
      </SectionCard>

      {/* Completion check */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        <span>Loja configurada. {storeUrl ? <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="underline">Ver loja pública</a> : 'Defina um slug para publicar sua loja.'}</span>
      </div>
    </div>
  );
}

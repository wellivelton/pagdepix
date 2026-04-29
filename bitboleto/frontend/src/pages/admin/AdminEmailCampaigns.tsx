import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Plus, Send, Pencil, Trash2, Eye, X, Check, ChevronRight,
  ChevronLeft, Loader2, BarChart2, AlertCircle,
  FileText, ToggleLeft, ToggleRight,
} from 'lucide-react';
import api from '../../services/api';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED';
  targetType: string;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  totalOpened: number;
  sentAt: string | null;
  createdAt: string;
}

interface CampaignDetail extends Campaign {
  htmlBody: string;
  textBody: string | null;
  fromName: string;
  targetRoles: string[];
  targetUserIds: string[];
  targetSegment: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  htmlBody: string;
}

type View = 'list' | 'create' | 'edit' | 'metrics' | 'templates';

/* ─── Constants ─────────────────────────────────────────────────────── */
const STATUS_CONFIG = {
  DRAFT:   { label: 'Rascunho', cls: 'bg-gray-700 text-gray-300' },
  SENDING: { label: 'Enviando', cls: 'bg-yellow-500/20 text-yellow-400 animate-pulse' },
  SENT:    { label: 'Enviada',  cls: 'bg-green-500/20 text-green-400' },
  FAILED:  { label: 'Falhou',   cls: 'bg-red-500/20 text-red-400' },
};

const TARGET_CONFIG: Record<string, { label: string; desc: string }> = {
  ALL:     { label: 'Todos os usuários', desc: 'Envia para todos os cadastrados' },
  ROLES:   { label: 'Por perfil',        desc: 'Filtra por tipo de conta' },
  SEGMENT: { label: 'Segmento',          desc: 'Filtra por comportamento' },
  USERS:   { label: 'Usuários específicos', desc: 'Lista manual de IDs' },
};

const SEGMENTS = [
  { value: 'active_30d',   label: 'Ativos nos últimos 30 dias' },
  { value: 'inactive_30d', label: 'Inativos há mais de 30 dias' },
  { value: 'commerce',     label: 'Comerciantes' },
  { value: 'affiliate',    label: 'Afiliados' },
];

const ROLES = [
  { value: 'USER',      label: 'Usuário' },
  { value: 'COMMERCE',  label: 'Comerciante' },
  { value: 'AFFILIATE', label: 'Afiliado' },
];

const TEMPLATE_VARS = [
  { tag: '{{nome}}',   desc: 'Nome do usuário' },
  { tag: '{{email}}',  desc: 'Email do usuário' },
  { tag: '{{saldo}}',  desc: 'Saldo atual' },
];

const HTML_BLOCKS = {
  header: `<div style="background:#f97316;padding:24px;text-align:center;border-radius:8px 8px 0 0">
  <h1 style="color:#fff;margin:0;font-size:24px;font-family:sans-serif">PagDepix</h1>
</div>`,
  body: `<div style="background:#1a1a1a;padding:24px;font-family:sans-serif;color:#e5e7eb">
  <p>Olá {{nome}},</p>
  <p>Escreva sua mensagem aqui...</p>
</div>`,
  button: `<div style="text-align:center;margin:24px 0">
  <a href="https://www.pagdepix.com" style="background:#f97316;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-family:sans-serif">Acessar PagDepix</a>
</div>`,
  footer: `<div style="background:#111;padding:16px;text-align:center;border-radius:0 0 8px 8px">
  <p style="color:#666;font-size:11px;margin:0;font-family:sans-serif">© 2024 PagDepix · Todos os direitos reservados</p>
</div>`,
};

const STARTER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f">
<div style="max-width:600px;margin:40px auto">
${HTML_BLOCKS.header}
${HTML_BLOCKS.body}
${HTML_BLOCKS.button}
${HTML_BLOCKS.footer}
</div>
</body>
</html>`;

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';
const inputCls = `w-full px-3 py-2 bg-gray-900/60 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 ${focusRing}`;

/* ─── Campaign Form ─────────────────────────────────────────────────── */
type FormData = {
  name: string;
  subject: string;
  fromName: string;
  htmlBody: string;
  targetType: string;
  targetRoles: string[];
  targetSegment: string;
  targetUserIds: string;
};

const EMPTY_FORM: FormData = {
  name: '', subject: '', fromName: 'PagDepix',
  htmlBody: STARTER_HTML,
  targetType: 'ALL', targetRoles: [], targetSegment: '', targetUserIds: '',
};

function CampaignForm({
  initial, onSave, onCancel, templates,
}: {
  initial?: Partial<CampaignDetail>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  templates: Template[];
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    ...EMPTY_FORM,
    ...(initial ? {
      name: initial.name || '',
      subject: initial.subject || '',
      fromName: initial.fromName || 'PagDepix',
      htmlBody: initial.htmlBody || STARTER_HTML,
      targetType: initial.targetType || 'ALL',
      targetRoles: initial.targetRoles || [],
      targetSegment: initial.targetSegment || '',
      targetUserIds: (initial.targetUserIds || []).join('\n'),
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [audiencePreview, setAudiencePreview] = useState<{ count: number; sample: any[] } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSent, setTestSent] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);

  const set = (k: keyof FormData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const loadAudience = useCallback(async () => {
    setAudienceLoading(true);
    try {
      const { data } = await api.post('/admin/email/campaigns/audience', {
        targetType: form.targetType,
        targetRoles: form.targetRoles,
        targetSegment: form.targetSegment || null,
        targetUserIds: form.targetType === 'USERS'
          ? form.targetUserIds.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
      });
      setAudiencePreview(data);
    } catch { /* ignore */ }
    setAudienceLoading(false);
  }, [form.targetType, form.targetRoles, form.targetSegment, form.targetUserIds]);

  useEffect(() => {
    if (step === 3) loadAudience();
  }, [step, loadAudience]);

  const sendTest = async () => {
    if (!testEmail.trim() || !initial?.id) return;
    try {
      await api.post(`/admin/email/campaigns/${initial.id}/test`, { testEmail });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao enviar teste');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    if (!form.subject.trim()) { setError('Assunto é obrigatório'); return; }
    if (!form.htmlBody.trim()) { setError('Conteúdo HTML é obrigatório'); return; }
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await onSave({
        name: form.name.trim(),
        subject: form.subject.trim(),
        fromName: form.fromName.trim() || 'PagDepix',
        htmlBody: form.htmlBody,
        targetType: form.targetType,
        targetRoles: form.targetType === 'ROLES' ? form.targetRoles : [],
        targetSegment: form.targetType === 'SEGMENT' ? form.targetSegment : null,
        targetUserIds: form.targetType === 'USERS'
          ? form.targetUserIds.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const insertVar = (tag: string) => {
    set('htmlBody', form.htmlBody + tag);
  };
  const insertBlock = (html: string) => {
    set('htmlBody', form.htmlBody.replace(/<\/body>/i, `${html}\n</body>`) || form.htmlBody + '\n' + html);
  };

  const STEPS = ['Configurações', 'Conteúdo', 'Destinatários', 'Revisão'];

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(i + 1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              step === i + 1
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : i + 1 < step
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600'
            }`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              step === i + 1 ? 'bg-orange-500 text-black' : i + 1 < step ? 'bg-green-500 text-black' : 'bg-gray-700 text-gray-400'
            }`}>{i + 1 < step ? '✓' : i + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" />
          Campanha salva! Redirecionando...
        </div>
      )}

      {/* Step 1: Settings */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nome interno da campanha *</label>
            <input className={inputCls} placeholder="Ex: Campanha de Boas-vindas" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Assunto do email *</label>
            <input className={inputCls} placeholder="Ex: Novidades do PagDepix 🚀" value={form.subject} onChange={e => set('subject', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nome do remetente</label>
            <input className={inputCls} placeholder="PagDepix" value={form.fromName} onChange={e => set('fromName', e.target.value)} />
            <p className="text-[11px] text-gray-500 mt-1">Aparece como: {form.fromName || 'PagDepix'} &lt;no-reply@mail.pagdepix.com&gt;</p>
          </div>
        </div>
      )}

      {/* Step 2: Content editor */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Template picker */}
            {templates.length > 0 && (
              <button
                type="button"
                onClick={() => setTemplatePicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition"
              >
                <FileText className="w-3.5 h-3.5" /> Carregar template
              </button>
            )}
            <button
              type="button"
              onClick={() => setPreview(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${preview ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700/50 hover:bg-gray-700 text-gray-300'}`}
            >
              <Eye className="w-3.5 h-3.5" /> {preview ? 'Fechar preview' : 'Preview'}
            </button>
          </div>

          {/* Blocks toolbar */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-500 self-center mr-1">Inserir bloco:</span>
            {Object.entries(HTML_BLOCKS).map(([key, html]) => (
              <button
                key={key}
                type="button"
                onClick={() => insertBlock(html)}
                className="px-2 py-0.5 bg-gray-700/40 hover:bg-gray-700 rounded text-[10px] text-gray-400 hover:text-white transition capitalize"
              >
                {key}
              </button>
            ))}
          </div>

          {/* Variable tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-500 self-center mr-1">Variáveis:</span>
            {TEMPLATE_VARS.map(v => (
              <button
                key={v.tag}
                type="button"
                onClick={() => insertVar(v.tag)}
                title={v.desc}
                className="px-2 py-0.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded text-[10px] text-orange-400 font-mono transition"
              >
                {v.tag}
              </button>
            ))}
          </div>

          <div className={`grid gap-3 ${preview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">HTML do email *</label>
              <textarea
                className={`${inputCls} font-mono text-xs resize-none`}
                rows={preview ? 22 : 16}
                value={form.htmlBody}
                onChange={e => set('htmlBody', e.target.value)}
                placeholder="Cole ou escreva o HTML do email..."
              />
            </div>
            {preview && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Preview</p>
                <div className="rounded-lg border border-gray-700 overflow-hidden bg-white" style={{ height: '386px' }}>
                  <iframe
                    title="email-preview"
                    srcDoc={form.htmlBody}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Test send (only for existing campaigns) */}
          {initial?.id && (
            <div className="flex items-center gap-2 p-3 bg-gray-900/40 rounded-lg border border-gray-700/40">
              <input
                className={`${inputCls} flex-1`}
                placeholder="email@teste.com"
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
              />
              <button
                type="button"
                onClick={sendTest}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-white transition"
              >
                {testSent ? <><Check className="w-3.5 h-3.5 text-green-400" /> Enviado!</> : <><Send className="w-3.5 h-3.5" /> Testar</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Audience */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(TARGET_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => set('targetType', key)}
                className={`text-left p-3 rounded-xl border transition ${
                  form.targetType === key
                    ? 'border-orange-500/50 bg-orange-500/10'
                    : 'border-gray-700/40 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <p className={`text-sm font-medium ${form.targetType === key ? 'text-orange-400' : 'text-white'}`}>{cfg.label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{cfg.desc}</p>
              </button>
            ))}
          </div>

          {form.targetType === 'ROLES' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Selecionar perfis</label>
              <div className="flex gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set('targetRoles', form.targetRoles.includes(r.value)
                      ? form.targetRoles.filter(x => x !== r.value)
                      : [...form.targetRoles, r.value])}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      form.targetRoles.includes(r.value)
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.targetType === 'SEGMENT' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Selecionar segmento</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEGMENTS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => set('targetSegment', s.value)}
                    className={`text-left px-3 py-2 rounded-lg text-xs border transition ${
                      form.targetSegment === s.value
                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.targetType === 'USERS' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">IDs de usuários (um por linha)</label>
              <textarea
                className={`${inputCls} font-mono text-xs resize-none`}
                rows={5}
                placeholder="uuid-do-usuario-1&#10;uuid-do-usuario-2"
                value={form.targetUserIds}
                onChange={e => set('targetUserIds', e.target.value)}
              />
            </div>
          )}

          {/* Audience preview */}
          <div className="p-3 bg-gray-900/40 rounded-xl border border-gray-700/40">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-400">Estimativa de destinatários</p>
              <button
                type="button"
                onClick={loadAudience}
                className="text-xs text-orange-400 hover:text-orange-300 transition"
              >
                Atualizar
              </button>
            </div>
            {audienceLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando...
              </div>
            ) : audiencePreview ? (
              <div>
                <p className="text-2xl font-bold text-white">{audiencePreview.count.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-gray-500">usuários receberão este email (excluindo descadastrados)</p>
                {audiencePreview.sample.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {audiencePreview.sample.map((u: any, i: number) => (
                      <p key={i} className="text-[11px] text-gray-500 font-mono">{u.name} · {u.email}</p>
                    ))}
                    {audiencePreview.count > 5 && (
                      <p className="text-[11px] text-gray-600">+{audiencePreview.count - 5} outros...</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-700/40 divide-y divide-gray-700/40">
            {[
              { label: 'Nome', value: form.name },
              { label: 'Assunto', value: form.subject },
              { label: 'Remetente', value: `${form.fromName} <no-reply@mail.pagdepix.com>` },
              { label: 'Destinatários', value: TARGET_CONFIG[form.targetType]?.label },
              { label: 'Estimativa', value: audiencePreview ? `${audiencePreview.count.toLocaleString('pt-BR')} usuários` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-xs text-white font-medium text-right max-w-xs truncate">{value}</span>
              </div>
            ))}
          </div>
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-xs text-yellow-400">
              Após o envio, a campanha não pode ser editada. Certifique-se de que o conteúdo está correto.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-700/40">
        <button
          type="button"
          onClick={step > 1 ? () => setStep(s => s - 1) : onCancel}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-400 hover:text-white transition"
        >
          <ChevronLeft className="w-4 h-4" />
          {step > 1 ? 'Anterior' : 'Cancelar'}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar rascunho
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg text-sm text-black font-semibold transition"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg text-sm text-black font-semibold transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar
            </button>
          )}
        </div>
      </div>

      {/* Template picker modal */}
      {templatePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Selecionar Template</h3>
              <button type="button" onClick={() => setTemplatePicker(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { set('htmlBody', t.htmlBody); set('subject', t.subject); setTemplatePicker(false); }}
                  className="w-full text-left p-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 transition"
                >
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">{t.subject}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Metrics View ──────────────────────────────────────────────────── */
function MetricsView({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/email/campaigns/${campaignId}/metrics`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>;
  if (!data) return null;

  const { campaign, metrics } = data;

  const stats = [
    { label: 'Destinatários', value: campaign.totalRecipients, color: 'text-white' },
    { label: 'Entregues',     value: campaign.totalSent,       sub: `${metrics.deliveryRate}%`, color: 'text-green-400' },
    { label: 'Falhas',        value: campaign.totalFailed,     color: 'text-red-400' },
    { label: 'Aberturas',     value: campaign.totalOpened,     sub: `${metrics.openRate}%`, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-gray-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="font-bold text-white">{campaign.name}</h3>
          <p className="text-xs text-gray-400">{campaign.subject}</p>
        </div>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.cls}`}>
          {STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG]?.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString('pt-BR')}</p>
            {s.sub && <p className="text-xs text-gray-500 mt-0.5">{s.sub} da meta</p>}
          </div>
        ))}
      </div>

      {/* Progress bars */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Funil de entrega</p>
        {[
          { label: 'Taxa de entrega', value: metrics.deliveryRate, color: 'bg-green-500' },
          { label: 'Taxa de abertura', value: metrics.openRate, color: 'bg-orange-500' },
        ].map(m => (
          <div key={m.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{m.label}</span>
              <span className="text-white font-medium">{m.value}%</span>
            </div>
            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.value}%`, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {campaign.sentAt && (
        <p className="text-xs text-gray-500 text-center">
          Enviada em {new Date(campaign.sentAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}

/* ─── Templates Manager ─────────────────────────────────────────────── */
function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', subject: '', htmlBody: STARTER_HTML });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = () => {
    api.get('/admin/email/templates')
      .then(r => setTemplates(r.data.templates))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/admin/email/templates/${editing.id}`, form);
      } else {
        await api.post('/admin/email/templates', form);
      }
      load();
      setEditing(null);
      setCreating(false);
      setForm({ name: '', description: '', subject: '', htmlBody: STARTER_HTML });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este template?')) return;
    await api.delete(`/admin/email/templates/${id}`);
    load();
  };

  const startEdit = (t: Template) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description || '', subject: t.subject, htmlBody: t.htmlBody });
    setCreating(false);
  };

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-orange-500 animate-spin" /></div>;

  if (creating || editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setCreating(false); setEditing(null); }} className="text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-white">{editing ? 'Editar Template' : 'Novo Template'}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nome *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do template" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Assunto *</label>
            <input className={inputCls} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Assunto padrão" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Descrição</label>
          <input className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
        </div>
        <div className="flex items-center justify-between">
          <label className="block text-xs text-gray-400">HTML do email *</label>
          <button type="button" onClick={() => setPreview(v => !v)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-400 transition">
            <Eye className="w-3.5 h-3.5" /> {preview ? 'Fechar' : 'Preview'}
          </button>
        </div>
        <div className={`grid gap-3 ${preview ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <textarea
            className={`${inputCls} font-mono text-xs resize-none`}
            rows={16}
            value={form.htmlBody}
            onChange={e => setForm(f => ({ ...f, htmlBody: e.target.value }))}
          />
          {preview && (
            <div className="rounded-lg border border-gray-700 overflow-hidden bg-white" style={{ height: '370px' }}>
              <iframe title="template-preview" srcDoc={form.htmlBody} className="w-full h-full border-0" sandbox="allow-same-origin" />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg text-sm text-black font-semibold transition disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{templates.length} {templates.length === 1 ? 'template' : 'templates'}</p>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 rounded-lg text-xs text-black font-semibold transition">
          <Plus className="w-3.5 h-3.5" /> Novo template
        </button>
      </div>
      {templates.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Nenhum template criado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700/40 hover:border-gray-600/60 transition">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{t.name}</p>
                {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{t.subject}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────── */
export default function AdminEmailCampaigns() {
  const [tab, setTab] = useState<'campaigns' | 'templates' | 'unsubscribed'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<CampaignDetail | null>(null);
  const [metricsId, setMetricsId] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [unsubscribed, setUnsubscribed] = useState<any[]>([]);
  const [unsubLoading, setUnsubLoading] = useState(false);

  const loadCampaigns = useCallback(() => {
    api.get('/admin/email/campaigns').then(r => setCampaigns(r.data.campaigns)).finally(() => setLoading(false));
  }, []);

  const loadTemplates = useCallback(() => {
    api.get('/admin/email/templates').then(r => setTemplates(r.data.templates)).catch(() => {});
  }, []);

  useEffect(() => { loadCampaigns(); loadTemplates(); }, [loadCampaigns, loadTemplates]);

  const handleCreate = async (data: any) => {
    await api.post('/admin/email/campaigns', data);
    loadCampaigns();
    // brief pause so the saved=true flash is visible before unmount
    await new Promise(r => setTimeout(r, 800));
    setView('list');
  };

  const handleUpdate = async (data: any) => {
    if (!editing) return;
    await api.put(`/admin/email/campaigns/${editing.id}`, data);
    loadCampaigns();
    await new Promise(r => setTimeout(r, 800));
    setView('list');
    setEditing(null);
  };

  const handleSend = async (campaign: Campaign) => {
    if (!confirm(`Enviar a campanha "${campaign.name}" para ${campaign.totalRecipients > 0 ? campaign.totalRecipients.toLocaleString('pt-BR') : 'todos os destinatários'} usuários?`)) return;
    setSending(campaign.id);
    try {
      await api.post(`/admin/email/campaigns/${campaign.id}/send`);
      loadCampaigns();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao enviar campanha');
    }
    setSending(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar esta campanha?')) return;
    await api.delete(`/admin/email/campaigns/${id}`);
    loadCampaigns();
  };

  const openEdit = async (c: Campaign) => {
    const { data } = await api.get(`/admin/email/campaigns/${c.id}`);
    setEditing(data.campaign);
    setView('edit');
  };

  const loadUnsubscribed = () => {
    setUnsubLoading(true);
    api.get('/admin/email/unsubscribed').then(r => setUnsubscribed(r.data.list)).finally(() => setUnsubLoading(false));
  };

  if (metricsId) {
    return <MetricsView campaignId={metricsId} onBack={() => setMetricsId(null)} />;
  }

  if (view === 'create') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView('list')} className="text-gray-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="font-bold text-white">Nova Campanha</h3>
        </div>
        <CampaignForm onSave={handleCreate} onCancel={() => setView('list')} templates={templates} />
      </div>
    );
  }

  if (view === 'edit' && editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setView('list'); setEditing(null); }} className="text-gray-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="font-bold text-white">Editar Campanha</h3>
          <span className="ml-auto text-xs text-gray-500 font-mono truncate max-w-xs hidden sm:block">{editing.name}</span>
        </div>
        <CampaignForm initial={editing} onSave={handleUpdate} onCancel={() => { setView('list'); setEditing(null); }} templates={templates} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-900/50 rounded-xl p-1 w-fit">
        {[
          { key: 'campaigns',    label: 'Campanhas', icon: Mail },
          { key: 'templates',    label: 'Templates',  icon: FileText },
          { key: 'unsubscribed', label: 'Descadastros', icon: ToggleLeft },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key as any); if (key === 'unsubscribed' && unsubscribed.length === 0) loadUnsubscribed(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Campaigns tab */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}</p>
            <button
              type="button"
              onClick={() => setView('create')}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg text-xs text-black font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" /> Nova campanha
            </button>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-orange-500 animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <div className="py-16 text-center">
              <Mail className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma campanha criada</p>
              <p className="text-gray-600 text-xs mt-1">Crie sua primeira campanha de email marketing</p>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => {
                const sc = STATUS_CONFIG[c.status];
                const openRate = c.totalSent > 0 ? ((c.totalOpened / c.totalSent) * 100).toFixed(0) : null;
                return (
                  <div
                    key={c.id}
                    className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4 hover:border-gray-600/60 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-700/50 rounded-lg flex-shrink-0">
                        <Mail className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sc.cls}`}>{sc.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{c.subject}</p>
                        {c.status === 'SENT' && (
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                            <span><span className="text-green-400 font-medium">{c.totalSent}</span> enviados</span>
                            {c.totalFailed > 0 && <span><span className="text-red-400 font-medium">{c.totalFailed}</span> falhas</span>}
                            {openRate && <span><span className="text-orange-400 font-medium">{openRate}%</span> abertura</span>}
                            <span>· {c.sentAt ? new Date(c.sentAt).toLocaleDateString('pt-BR') : '—'}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {c.status === 'SENT' && (
                          <button
                            type="button"
                            onClick={() => setMetricsId(c.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition"
                            title="Ver métricas"
                          >
                            <BarChart2 className="w-4 h-4" />
                          </button>
                        )}
                        {c.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSend(c)}
                              disabled={sending === c.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 rounded-lg text-xs text-black font-semibold transition disabled:opacity-50"
                            >
                              {sending === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              Enviar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && <TemplatesManager />}

      {/* Unsubscribed */}
      {tab === 'unsubscribed' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{unsubscribed.length} descadastros</p>
            <button type="button" onClick={loadUnsubscribed} className="text-xs text-gray-500 hover:text-white transition">Atualizar</button>
          </div>
          {unsubLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-orange-500 animate-spin" /></div>
          ) : unsubscribed.length === 0 ? (
            <div className="py-12 text-center">
              <ToggleRight className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Nenhum descadastro registrado</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {unsubscribed.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700/30">
                  <p className="text-sm text-gray-300 font-mono">{u.email}</p>
                  <p className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

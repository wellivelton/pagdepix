# Análise e Melhorias - Página "Comprar Depix" (ReceberPix.tsx)

## 📊 Resumo Executivo

A página está funcional e bem estruturada, mas há oportunidades de melhoria em **UX**, **acessibilidade**, **feedback visual** e **organização do código**.

---

## 🎨 1. EXPERIÊNCIA DO USUÁRIO (UX)

### 1.1 Feedback Visual e Loading States

**Problemas identificados:**
- ❌ Preview de cálculo não mostra loading (usuário não sabe se está calculando)
- ❌ QR Code aparece sem transição suave
- ❌ Falta skeleton/placeholder enquanto carrega o QR
- ❌ Botão de copiar PIX não dá feedback imediato suficiente

**Melhorias sugeridas:**
```tsx
// Adicionar estado de loading no preview
const [calculatingPreview, setCalculatingPreview] = useState(false);

// No preview, mostrar skeleton enquanto calcula
{calculatingPreview && (
  <div className="animate-pulse bg-gray-700/50 h-20 rounded-xl" />
)}

// Feedback melhor ao copiar
const copyPixCode = () => {
  navigator.clipboard.writeText(order.qr_copy_paste);
  setCopied(true);
  // Adicionar toast/notificação visual mais visível
  toast.success('PIX copiado!'); // se tiver biblioteca de toast
  setTimeout(() => setCopied(false), 3000);
};
```

### 1.2 Validação em Tempo Real

**Problemas:**
- ❌ Erros só aparecem no submit
- ❌ Usuário não sabe se carteira é válida até tentar gerar QR
- ❌ Valor mínimo só aparece como texto pequeno

**Melhorias:**
```tsx
// Validação em tempo real do endereço Liquid
const [walletError, setWalletError] = useState('');

useEffect(() => {
  if (liquidWallet.trim().length > 0 && liquidWallet.trim().length < 20) {
    setWalletError('Endereço muito curto. Verifique se está completo.');
  } else if (liquidWallet.trim() && !liquidWallet.trim().startsWith('lq1')) {
    setWalletError('Endereço Liquid geralmente começa com "lq1". Verifique.');
  } else {
    setWalletError('');
  }
}, [liquidWallet]);

// Mostrar erro abaixo do input
{walletError && (
  <p className="text-red-400 text-xs mt-1">{walletError}</p>
)}
```

### 1.3 Informações Contextuais e Ajuda

**Problemas:**
- ❌ Usuário não sabe o que é "Liquid" ou como obter carteira
- ❌ Taxa não é explicada claramente
- ❌ Diferença entre "Quero receber" vs "Quero enviar" não está clara

**Melhorias:**
```tsx
// Tooltip/Info sobre Liquid
<div className="flex items-center gap-2 mb-2">
  <h3 className="text-sm font-medium text-gray-400">
    <Wallet className="w-4 h-4 inline mr-1" /> Onde receber o DePix?
  </h3>
  <button
    type="button"
    onClick={() => setShowWalletHelp(!showWalletHelp)}
    className="text-gray-500 hover:text-gray-300"
    title="O que é Liquid?"
  >
    <Info className="w-4 h-4" />
  </button>
</div>

{showWalletHelp && (
  <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-3 mb-3 text-sm text-blue-300">
    <p><strong>Liquid Network</strong> é uma sidechain do Bitcoin. Você precisa de uma carteira compatível (ex: Blockstream Green, Liquid Core).</p>
    <a href="#" className="underline mt-1 block">Como criar carteira Liquid →</a>
  </div>
)}
```

### 1.4 Tela de Resultado (Após Gerar QR)

**Problemas:**
- ❌ Tempo de expiração não é destacado
- ❌ Falta contador regressivo para expiração
- ❌ Status "under_review" não tem progresso visual
- ❌ Não mostra quando foi gerado o QR

**Melhorias:**
```tsx
// Contador regressivo
const [timeLeft, setTimeLeft] = useState<number | null>(null);

useEffect(() => {
  if (order?.expires_at && order.status === 'pending') {
    const interval = setInterval(() => {
      const diff = new Date(order.expires_at).getTime() - Date.now();
      if (diff > 0) {
        setTimeLeft(Math.floor(diff / 1000));
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }
}, [order]);

// Exibir contador
{timeLeft !== null && timeLeft > 0 && (
  <div className="bg-amber-500/10 border border-amber-500/50 rounded-xl p-3 mb-4">
    <p className="text-amber-300 text-sm">
      ⏱️ Expira em {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
    </p>
  </div>
)}
```

---

## 🎯 2. ACESSIBILIDADE

### 2.1 Labels e ARIA

**Problemas:**
- ❌ Inputs sem `<label>` associado (só texto acima)
- ❌ Falta `aria-label` em botões de ícone
- ❌ Mensagens de erro não são anunciadas para leitores de tela

**Melhorias:**
```tsx
// Labels corretos
<label htmlFor="amount-input" className="block text-sm font-medium text-gray-400 mb-2">
  Quanto?
</label>
<input
  id="amount-input"
  type="text"
  aria-describedby="amount-help amount-error"
  aria-invalid={amountNum < 5 && amountNum > 0}
  // ...
/>

// Mensagens de erro com aria-live
{error && (
  <div
    role="alert"
    aria-live="assertive"
    className="flex items-center gap-2 p-4 bg-red-500/10..."
  >
    {error}
  </div>
)}
```

### 2.2 Navegação por Teclado

**Problemas:**
- ❌ Botões de toggle "Quero receber/enviar" podem não ter foco visível
- ❌ Falta `tabIndex` e `onKeyDown` em elementos interativos

**Melhorias:**
```tsx
<button
  type="button"
  onClick={() => setAmountMode('receive')}
  onKeyDown={(e) => e.key === 'Enter' && setAmountMode('receive')}
  className="... focus:ring-2 focus:ring-bitcoin focus:outline-none"
  aria-pressed={amountMode === 'receive'}
>
  Quero receber
</button>
```

---

## 🏗️ 3. ORGANIZAÇÃO DO CÓDIGO

### 3.1 Componentização

**Problema:** Arquivo muito grande (412 linhas), tudo em um componente

**Sugestão:** Extrair componentes menores:

```tsx
// components/ReceberPix/AmountInput.tsx
export function AmountInput({ value, onChange, mode, onModeChange }) { ... }

// components/ReceberPix/WalletInput.tsx
export function WalletInput({ value, onChange, error }) { ... }

// components/ReceberPix/QRDisplay.tsx
export function QRDisplay({ order, onCopy, copied }) { ... }

// components/ReceberPix/OrderResult.tsx
export function OrderResult({ order, totalToPay, onStartOver }) { ... }
```

### 3.2 Hooks Customizados

**Sugestão:** Extrair lógica para hooks:

```tsx
// hooks/useDepixOrder.ts
export function useDepixOrder(orderId: string | null) {
  const [order, setOrder] = useState<DepixOrder | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!orderId) return;
    // polling logic
  }, [orderId]);
  
  return { order, loading };
}

// hooks/useAmountFormat.ts
export function useAmountFormat() {
  const formatAmountInput = (raw: string): string => { ... };
  const parseBrl = (s: string): number => { ... };
  return { formatAmountInput, parseBrl };
}
```

---

## ⚡ 4. PERFORMANCE

### 4.1 Debounce e Memoização

**Problemas:**
- ✅ Preview já tem debounce (400ms) - OK
- ❌ `formatAmountInput` é recriada a cada render
- ❌ Preview recalcula mesmo quando não mudou

**Melhorias:**
```tsx
// Memoizar formatação
const formatAmountInput = useCallback((raw: string): string => {
  // ... lógica
}, []);

// Evitar recálculo desnecessário
const previewKey = `${amountNum}-${amountMode}-${couponCode}`;
const lastPreviewKey = useRef('');
useEffect(() => {
  if (previewKey === lastPreviewKey.current) return;
  lastPreviewKey.current = previewKey;
  // calcular preview
}, [previewKey]);
```

### 4.2 Lazy Loading de Imagens

**Problema:** QR Code carrega sempre, mesmo se não for usado

**Melhoria:**
```tsx
<img
  src={order.qr_image_url}
  alt="QR Code Pix"
  loading="lazy"
  className="..."
/>
```

---

## 🎨 5. LAYOUT E DESIGN

### 5.1 Hierarquia Visual

**Problemas:**
- ❌ Resumo do checkout (valor a pagar) não é destacado o suficiente
- ❌ Botão principal pode ser mais visível
- ❌ Falta espaçamento consistente

**Melhorias:**
```tsx
// Resumo mais destacado
{preview && (
  <div className="p-6 bg-gradient-to-br from-bitcoin/20 to-orange-500/20 rounded-xl border-2 border-bitcoin/50 space-y-3 shadow-lg">
    <div className="flex items-center justify-between">
      <span className="text-gray-300">Você pagará:</span>
      <span className="text-2xl font-bold text-white">R$ {formatBrl(preview.totalToPay)}</span>
    </div>
    <div className="h-px bg-bitcoin/30" />
    <div className="flex items-center justify-between">
      <span className="text-gray-300">Você receberá:</span>
      <span className="text-2xl font-bold text-green-400">{amountNum.toFixed(2)} DPX</span>
    </div>
  </div>
)}
```

### 5.2 Responsividade

**Problemas:**
- ❌ QR Code pode ficar grande demais em mobile
- ❌ Inputs podem ser pequenos em telas pequenas

**Melhorias:**
```tsx
// QR Code responsivo
<img
  src={order.qr_image_url}
  alt="QR Code Pix"
  className="w-full max-w-64 sm:max-w-80 md:max-w-96 h-auto object-contain bg-white rounded-xl p-2 mx-auto"
/>

// Inputs com tamanho mínimo em mobile
<input
  className="w-full p-4 sm:p-5 bg-gray-900/50 rounded-xl text-base sm:text-xl"
/>
```

### 5.3 Estados Visuais

**Melhorias:**
```tsx
// Estados do botão mais claros
<button
  disabled={loading || amountNum < 5 || !liquidWallet.trim()}
  className={`
    w-full py-4 rounded-xl font-bold transition-all
    ${loading
      ? 'bg-gray-600 cursor-wait'
      : amountNum < 5 || !liquidWallet.trim()
      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
      : 'bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-2xl hover:shadow-bitcoin/30 active:scale-[0.98]'
    }
  `}
>
```

---

## 🛡️ 6. TRATAMENTO DE ERROS

### 6.1 Mensagens Específicas

**Problema:** Mensagens genéricas demais

**Melhorias:**
```tsx
catch (err: unknown) {
  const res = err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { data?: unknown; status?: number } }).response
    : null;
  
  let msg = 'Erro ao gerar QR Code. Tente novamente.';
  
  if (res?.status === 400) {
    const data = res.data as { error?: string };
    msg = data?.error || 'Dados inválidos. Verifique os campos.';
  } else if (res?.status === 401) {
    msg = 'Sessão expirada. Faça login novamente.';
  } else if (res?.status === 500) {
    msg = 'Erro no servidor. Tente novamente em alguns instantes.';
  } else if (!res) {
    msg = 'Sem conexão. Verifique sua internet.';
  }
  
  setError(msg);
}
```

### 6.2 Retry Automático

**Sugestão:** Para erros de rede, oferecer botão "Tentar novamente"

```tsx
{error && error.includes('conexão') && (
  <div className="...">
    <AlertCircle className="w-5 h-5" />
    <span>{error}</span>
    <button
      onClick={handleSubmit}
      className="ml-2 px-3 py-1 bg-bitcoin/20 rounded text-bitcoin text-sm"
    >
      Tentar novamente
    </button>
  </div>
)}
```

---

## 📱 7. MOBILE-FIRST

### 7.1 Melhorias para Mobile

**Sugestões:**
- Input numérico com teclado numérico (`inputMode="decimal"` já está ✅)
- Botões maiores (mínimo 44x44px para toque)
- Espaçamento adequado entre elementos clicáveis
- QR Code com opção de "abrir no app do banco" (deep link)

```tsx
// Botão para abrir app do banco
{order.qr_copy_paste && (
  <a
    href={`bank://pix?code=${encodeURIComponent(order.qr_copy_paste)}`}
    className="block w-full mt-2 px-4 py-3 bg-green-500/20 hover:bg-green-500/30 rounded-xl text-green-400 text-center font-medium"
  >
    Abrir no app do banco
  </a>
)}
```

---

## ✅ 8. CHECKLIST DE MELHORIAS PRIORITÁRIAS

### Alta Prioridade
- [ ] Adicionar loading state no preview de cálculo
- [ ] Validação em tempo real do endereço Liquid
- [ ] Labels corretos (`htmlFor` + `id`) para acessibilidade
- [ ] Contador regressivo de expiração do QR
- [ ] Mensagens de erro mais específicas

### Média Prioridade
- [ ] Tooltip/ajuda sobre Liquid Network
- [ ] Componentizar (extrair AmountInput, WalletInput, etc.)
- [ ] Melhorar hierarquia visual do resumo
- [ ] Adicionar `aria-live` para leitores de tela

### Baixa Prioridade
- [ ] Hooks customizados (useDepixOrder, useAmountFormat)
- [ ] Retry automático em erros de rede
- [ ] Deep link para app do banco
- [ ] Animações suaves de transição

---

## 🎯 Conclusão

A página está **funcional e bem estruturada**, mas pode melhorar significativamente em:
1. **Feedback visual** (loading states, validação em tempo real)
2. **Acessibilidade** (labels, ARIA, navegação por teclado)
3. **Organização** (componentização, hooks)
4. **UX** (ajuda contextual, contador de expiração)

Priorize as melhorias de **alta prioridade** primeiro, pois têm maior impacto na experiência do usuário.

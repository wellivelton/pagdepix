import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies so we can test parseBarcodeAmount in isolation
vi.mock('../../prisma', () => ({ prisma: {} }));
vi.mock('../exchangeRate', () => ({ getRates: vi.fn() }));
vi.mock('../liquidHdWallet.service', () => ({
  isXpubConfigured: vi.fn(() => false),
  getNextAddressIndex: vi.fn(),
  deriveLiquidAddress: vi.fn(),
}));
vi.mock('../../config/env', () => ({ env: {} }));
vi.mock('../rvhub.service', () => ({
  rvhubIsConfigured: vi.fn(() => false),
  rvhubCreateBillPayment: vi.fn(),
  rvhubCaptureBillPayment: vi.fn(),
  rvhubGetBillPayment: vi.fn(),
  rvhubCancelBillPayment: vi.fn(),
}));
vi.mock('../../utils/antifraud', () => ({
  validateCouponUsage: vi.fn(),
  isUserVerified: vi.fn(),
}));
vi.mock('../../utils/safeError', () => ({
  getSafeErrorMessage: vi.fn((e: unknown, fallback: string) => fallback),
}));

import { parseBarcodeAmount } from '../billPayment';

// Helper para montar barcode de 44 dígitos com valor específico em centavos
function makeBarcode44(centavos: number): string {
  const valor = String(centavos).padStart(10, '0');
  // bank(3) + moeda(1) + check(1) + vencimento(4) + valor(10) + livre(25)
  return '34191' + '1471' + valor + '1234567890123456789012345';
}

// Helper para montar linha digitável de 47 dígitos com valor específico em centavos
function makeDL47(centavos: number): string {
  const valor = String(centavos).padStart(10, '0');
  // Campo1(10) + Campo2(11) + Campo3(11) + Campo4(1) + [venc(4) + valor(10)](14)
  return '1234567890' + '12345678901' + '12345678901' + '1' + '1471' + valor;
}

// Helper para montar barcode de concessionária 48 dígitos com valor em centavos
// Estrutura: produto(1) + segmento(1) + tipoValor(1) + check(1) + zero(1) + valor(10) + livre(33)
// O parser extrai posições 5-14 (valor em centavos)
function makeBarcode48(centavos: number): string {
  const valor = String(centavos).padStart(10, '0');
  return '8162' + '0' + valor + '123456789012345678901234567890123';
}

describe('parseBarcodeAmount', () => {
  // ─── 44 dígitos (código de barras bancário) ──────────────────────────────

  it('44d — extrai R$ 178,19 corretamente', () => {
    expect(parseBarcodeAmount(makeBarcode44(17819))).toBe(178.19);
  });

  it('44d — extrai R$ 20,00 (valor mínimo)', () => {
    expect(parseBarcodeAmount(makeBarcode44(2000))).toBe(20.00);
  });

  it('44d — extrai R$ 5.000,00 (valor máximo)', () => {
    expect(parseBarcodeAmount(makeBarcode44(500000))).toBe(5000.00);
  });

  it('44d — rejeita R$ 5.000,01 (acima do limite)', () => {
    expect(parseBarcodeAmount(makeBarcode44(500001))).toBeNull();
  });

  it('44d — rejeita valor zero', () => {
    expect(parseBarcodeAmount(makeBarcode44(0))).toBeNull();
  });

  // ─── 47 dígitos (linha digitável bancária) ───────────────────────────────

  it('47d — extrai R$ 178,19 com slice correto (posições 37-47, não 33-43)', () => {
    const dl = makeDL47(17819);
    expect(dl.length).toBe(47);
    expect(parseBarcodeAmount(dl)).toBe(178.19);
  });

  it('47d — confirma que slice antigo (33-43) teria dado valor errado', () => {
    // Este teste documenta o bug original: vencimento "1471" + início do valor
    // na posição 33-43 produzia um número inflado
    const dl = makeDL47(17819);
    const wrongSlice = dl.slice(33, 43); // = "1471000001"
    expect(parseInt(wrongSlice, 10) / 100).toBe(14710000.01); // era o valor bugado
  });

  it('47d — extrai R$ 0,01 (centavo mínimo)', () => {
    expect(parseBarcodeAmount(makeDL47(1))).toBe(0.01);
  });

  it('47d — extrai R$ 5.000,00 (limite máximo)', () => {
    expect(parseBarcodeAmount(makeDL47(500000))).toBe(5000.00);
  });

  it('47d — rejeita R$ 5.000,01', () => {
    expect(parseBarcodeAmount(makeDL47(500001))).toBeNull();
  });

  it('47d — rejeita valor zero', () => {
    expect(parseBarcodeAmount(makeDL47(0))).toBeNull();
  });

  it('47d — aceita código com pontos e espaços (remove não-dígitos)', () => {
    const dl = makeDL47(17819);
    const formatted = dl.replace(/(\d{10})(\d{11})(\d{11})(\d)(\d{14})/, '$1.$2.$3 $4 $5');
    expect(parseBarcodeAmount(formatted)).toBe(178.19);
  });

  // ─── 48 dígitos (concessionária) ─────────────────────────────────────────

  it('48d — extrai valor de concessionária corretamente', () => {
    expect(parseBarcodeAmount(makeBarcode48(15000))).toBe(150.00);
  });

  it('48d — rejeita valor acima do limite', () => {
    expect(parseBarcodeAmount(makeBarcode48(500001))).toBeNull();
  });

  // ─── Casos inválidos ──────────────────────────────────────────────────────

  it('string vazia retorna null', () => {
    expect(parseBarcodeAmount('')).toBeNull();
  });

  it('tamanho errado (30 dígitos) retorna null', () => {
    expect(parseBarcodeAmount('123456789012345678901234567890')).toBeNull();
  });

  it('string com apenas letras retorna null', () => {
    expect(parseBarcodeAmount('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBeNull();
  });
});

'use client';

// ============================================================
// AI Wallet — Modal de cuenta unificado
// components/AccountModal.tsx
//
// Reemplaza tanto AccountModal como NewAccountModal.
// Una sola fuente de verdad. Cero duplicación.
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CreateAccountInput, SimpleAccount } from '../hooks/useSimpleSupabase';
import { ACCOUNT_KINDS, KIND_BY_VALUE, PALETTE, type AccountUiKind } from '../lib/accountTypes';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AccountModalProps {
  onClose: () => void;
  /** Se llama cuando la cuenta fue creada exitosamente */
  onSuccess: (account: SimpleAccount) => void;
  createAccount: (data: CreateAccountInput) => Promise<SimpleAccount | null>;
  /** Si es la primera cuenta, se marca como default sin preguntar */
  isFirstAccount?: boolean;
}

// ─── Formateo de moneda en tiempo real ───────────────────────────────────────

function formatDisplayAmount(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('es-AR');
}

function parseAmount(display: string): number {
  return Number(display.replace(/\./g, '').replace(',', '.')) || 0;
}

// ─── Hook: input de dinero con formato automático ─────────────────────────────

function useMoneyInput(initial = '') {
  const [display, setDisplay] = useState(initial);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw   = e.target.value.replace(/\D/g, '');
    const formatted = raw ? Number(raw).toLocaleString('es-AR') : '';
    setDisplay(formatted);
  }, []);

  return { display, setDisplay, onChange, value: parseAmount(display) };
}

// ─── Primitivos de UI ─────────────────────────────────────────────────────────

const P = PALETTE;

const baseInput: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${P.border}`,
  borderRadius: '12px',
  color: P.white,
  padding: '13px 14px',
  fontSize: '15px',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: error ? '8px' : '14px' }}>
      <label style={{ fontSize: '11px', color: P.dim, marginBottom: '6px', display: 'block', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p style={{ fontSize: '11px', color: P.dim, marginTop: '5px', lineHeight: 1.4 }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: '11px', color: P.red, marginTop: '5px' }}>{error}</p>
      )}
    </div>
  );
}

function MoneyInput({
  display,
  onChange,
  placeholder,
  autoFocus,
  inputRef,
}: {
  display: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
        color: P.dim, fontSize: '15px', pointerEvents: 'none', userSelect: 'none',
      }}>
        $
      </span>
      <input
        ref={inputRef}
        inputMode="numeric"
        value={display}
        onChange={onChange}
        placeholder={placeholder ?? '0'}
        autoFocus={autoFocus}
        style={{ ...baseInput, paddingLeft: '28px' }}
        onFocus={e => (e.target.style.borderColor = `${P.green}60`)}
        onBlur={e  => (e.target.style.borderColor = P.border)}
      />
    </div>
  );
}

function DayInput({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={31}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        ...baseInput,
        textAlign: 'center',
        borderColor: error ? `${P.red}60` : P.border,
        padding: '13px 8px',
      }}
      onFocus={e => (e.target.style.borderColor = `${P.green}60`)}
      onBlur={e  => (e.target.style.borderColor = error ? `${P.red}60` : P.border)}
    />
  );
}

// ─── Selector de tipo de cuenta ───────────────────────────────────────────────

function KindSelector({
  selected,
  onChange,
}: {
  selected: AccountUiKind;
  onChange: (k: AccountUiKind) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
      {ACCOUNT_KINDS.map(opt => {
        const active = selected === opt.kind;
        return (
          <button
            key={opt.kind}
            onClick={() => onChange(opt.kind)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '14px',
              border: `1px solid ${active ? `${P.green}50` : P.border}`,
              background: active ? P.greenDim : 'rgba(255,255,255,0.025)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '22px', flexShrink: 0, lineHeight: 1 }}>{opt.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: active ? P.green : P.mid,
                marginBottom: '1px',
              }}>
                {opt.label}
              </div>
              <div style={{ fontSize: '11px', color: P.dim }}>{opt.sublabel}</div>
            </div>
            {/* Radio visual */}
            <span style={{
              width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${active ? P.green : 'rgba(255,255,255,0.2)'}`,
              background: active ? P.green : 'transparent',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {active && (
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#000' }} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Explicación tarjeta de crédito ───────────────────────────────────────────

function CreditExplainer() {
  return (
    <div style={{
      background: 'rgba(255,215,64,0.06)',
      border: '1px solid rgba(255,215,64,0.15)',
      borderRadius: '12px',
      padding: '12px 14px',
      marginBottom: '14px',
    }}>
      <div style={{ fontSize: '12px', color: P.yellow, fontWeight: 600, marginBottom: '4px' }}>
        💡 Cómo funciona la tarjeta en AI Wallet
      </div>
      <div style={{ fontSize: '11px', color: 'rgba(255,215,64,0.7)', lineHeight: 1.5 }}>
        Lo que <strong style={{ color: P.yellow }}>debés</strong> resta de tu disponible real.
        El <strong style={{ color: P.yellow }}>límite</strong> te muestra cuánto podés seguir gastando.
        Las cuotas se distribuyen mes a mes automáticamente.
      </div>
    </div>
  );
}

// ─── Pantalla de éxito ────────────────────────────────────────────────────────

function SuccessScreen({
  account,
  onDone,
}: {
  account: SimpleAccount;
  onDone: () => void;
}) {
  const isCredit  = account.type === 'credit';
  const available = isCredit
    ? Math.max(0, (account.credit_limit ?? 0) - account.balance)
    : account.balance;

  return (
    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
      {/* Ícono animado */}
      <div style={{
        width: '72px', height: '72px',
        background: P.greenDim,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
        fontSize: '32px',
        border: `1px solid ${P.green}40`,
        animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}>
        ✓
      </div>

      <div style={{ fontSize: '17px', fontWeight: 700, color: P.white, marginBottom: '6px' }}>
        {account.name} lista 🎉
      </div>

      <div style={{ fontSize: '13px', color: P.dim, marginBottom: '20px', lineHeight: 1.5 }}>
        {isCredit ? (
          <>
            Deuda actual:{' '}
            <span style={{ color: P.red, fontWeight: 600 }}>
              ${account.balance.toLocaleString('es-AR')}
            </span>
            {' · '}
            Disponible en tarjeta:{' '}
            <span style={{ color: P.green, fontWeight: 600 }}>
              ${available.toLocaleString('es-AR')}
            </span>
          </>
        ) : (
          <>
            Saldo cargado:{' '}
            <span style={{ color: P.green, fontWeight: 600 }}>
              ${account.balance.toLocaleString('es-AR')}
            </span>
          </>
        )}
      </div>

      <button
        onClick={onDone}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '14px',
          background: P.green,
          color: '#000',
          fontWeight: 700,
          fontSize: '15px',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Perfecto
      </button>

      <style>{`
        @keyframes popIn {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Validación ───────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  balance?: string;
  creditLimit?: string;
  closingDay?: string;
  dueDay?: string;
}

function validateForm(
  kind: AccountUiKind,
  name: string,
  balance: number,
  creditLimit: number,
  closingDay: string,
  dueDay: string,
): FormErrors {
  const errors: FormErrors = {};

  if (!name.trim()) {
    errors.name = 'Ponele un nombre';
  }

  if (isNaN(balance) || balance < 0) {
    errors.balance = 'Ingresá un monto válido';
  }

  if (kind === 'credit') {
    if (!creditLimit || creditLimit <= 0) {
      errors.creditLimit = 'Necesitamos el límite para calcular disponible';
    }
    const cd = Number(closingDay);
    const dd = Number(dueDay);
    if (!closingDay || cd < 1 || cd > 31) errors.closingDay = 'Entre 1 y 31';
    if (!dueDay    || dd < 1 || dd > 31) errors.dueDay     = 'Entre 1 y 31';
  }

  return errors;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AccountModal({
  onClose,
  onSuccess,
  createAccount,
  isFirstAccount = false,
}: AccountModalProps) {
  // ── Estado del formulario ──────────────────────────────────────────────────
  const [kind, setKind]           = useState<AccountUiKind>('digital');
  const [name, setName]           = useState('');
  const [isDefault, setIsDefault] = useState(isFirstAccount);
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay]         = useState('');

  const balance     = useMoneyInput();
  const creditLimit = useMoneyInput();

  const [errors, setErrors]  = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<SimpleAccount | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const config  = KIND_BY_VALUE[kind];

  // Auto-focus nombre al cambiar tipo
  useEffect(() => {
    if (kind === 'cash') {
      setName('Efectivo');
    } else if (name === 'Efectivo') {
      setName('');
    }
    // Limpiar campos de crédito al cambiar de tipo
    if (kind !== 'credit') {
      creditLimit.setDisplay('');
      setClosingDay('');
      setDueDay('');
    }
    setErrors({});
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const errs = validateForm(kind, name, balance.value, creditLimit.value, closingDay, dueDay);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setErrors({});

    const payload: CreateAccountInput = {
      name:       name.trim() || (kind === 'cash' ? 'Efectivo' : ''),
      type:       config.dbType,
      balance:    balance.value,
      is_default: isFirstAccount || isDefault,
      ...(kind === 'credit' && {
        credit_limit: creditLimit.value,
        closing_day:  Number(closingDay),
        due_day:      Number(dueDay),
      }),
    };

    const result = await createAccount(payload);
    setLoading(false);

    if (result) {
      setCreated(result);
    } else {
      setErrors({ name: 'No se pudo crear la cuenta. Intentá de nuevo.' });
    }
  };

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (created) {
    return (
      <Backdrop onClose={onClose}>
        <ModalSheet>
          <SuccessScreen account={created} onDone={() => { onSuccess(created); onClose(); }} />
        </ModalSheet>
      </Backdrop>
    );
  }

  // ── Formulario ─────────────────────────────────────────────────────────────
  return (
    <Backdrop onClose={onClose}>
      <ModalSheet>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: P.white }}>
            Nueva cuenta
          </span>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: P.dim,
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de tipo */}
        <KindSelector selected={kind} onChange={setKind} />

        {/* Nombre */}
        {kind !== 'cash' && (
          <Field label="Nombre" error={errors.name}>
            <input
              ref={nameRef}
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })); }}
              placeholder={config.namePlaceholder}
              style={baseInput}
              onFocus={e => (e.target.style.borderColor = `${P.green}60`)}
              onBlur={e  => (e.target.style.borderColor = P.border)}
            />
          </Field>
        )}

        {/* Tarjeta de crédito: explicación primero */}
        {kind === 'credit' && <CreditExplainer />}

        {/* Tarjeta: límite + días ANTES de la deuda */}
        {kind === 'credit' && (
          <>
            <Field label="Límite de la tarjeta" hint="El tope que te fijó el banco" error={errors.creditLimit}>
              <MoneyInput
                display={creditLimit.display}
                onChange={creditLimit.onChange}
                placeholder="500.000"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: P.dim, marginBottom: '6px', display: 'block', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Día de cierre
                </label>
                <DayInput
                  value={closingDay}
                  onChange={v => { setClosingDay(v); setErrors(p => ({ ...p, closingDay: undefined })); }}
                  placeholder="20"
                  error={!!errors.closingDay}
                />
                {errors.closingDay && (
                  <p style={{ fontSize: '11px', color: P.red, marginTop: '4px' }}>{errors.closingDay}</p>
                )}
                <p style={{ fontSize: '10px', color: P.dim, marginTop: '4px' }}>Cuando cierra el resumen</p>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: P.dim, marginBottom: '6px', display: 'block', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Día de vencimiento
                </label>
                <DayInput
                  value={dueDay}
                  onChange={v => { setDueDay(v); setErrors(p => ({ ...p, dueDay: undefined })); }}
                  placeholder="10"
                  error={!!errors.dueDay}
                />
                {errors.dueDay && (
                  <p style={{ fontSize: '11px', color: P.red, marginTop: '4px' }}>{errors.dueDay}</p>
                )}
                <p style={{ fontSize: '10px', color: P.dim, marginTop: '4px' }}>Fecha límite de pago</p>
              </div>
            </div>
          </>
        )}

        {/* Balance / Deuda */}
        <Field
          label={config.balanceLabel}
          hint={config.balanceHint}
          error={errors.balance}
        >
          <MoneyInput
            display={balance.display}
            onChange={e => { balance.onChange(e); setErrors(p => ({ ...p, balance: undefined })); }}
            autoFocus={kind === 'cash'}
          />
        </Field>

        {/* Preview en tiempo real para tarjeta */}
        {kind === 'credit' && creditLimit.value > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '10px',
            marginBottom: '14px',
            border: `1px solid ${P.border}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: P.dim, marginBottom: '2px' }}>DEUDA</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: P.red }}>
                ${balance.value.toLocaleString('es-AR')}
              </div>
            </div>
            <div style={{ width: '1px', background: P.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: P.dim, marginBottom: '2px' }}>DISPONIBLE</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: P.green }}>
                ${Math.max(0, creditLimit.value - balance.value).toLocaleString('es-AR')}
              </div>
            </div>
            <div style={{ width: '1px', background: P.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: P.dim, marginBottom: '2px' }}>LÍMITE</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: P.mid }}>
                ${creditLimit.value.toLocaleString('es-AR')}
              </div>
            </div>
          </div>
        )}

        {/* Toggle cuenta principal */}
        {!isFirstAccount && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            padding: '12px 14px',
            background: isDefault ? P.greenDim : 'rgba(255,255,255,0.025)',
            borderRadius: '12px',
            border: `1px solid ${isDefault ? `${P.green}40` : P.border}`,
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
            onClick={() => setIsDefault(v => !v)}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: isDefault ? P.green : P.mid }}>
                Cuenta principal
              </div>
              <div style={{ fontSize: '11px', color: P.dim }}>
                Los gastos del chat se registran acá
              </div>
            </div>
            {/* Toggle */}
            <div style={{
              width: '42px', height: '24px',
              borderRadius: '12px',
              background: isDefault ? P.green : 'rgba(255,255,255,0.12)',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute',
                top: '2px',
                left: isDefault ? '20px' : '2px',
                width: '20px', height: '20px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>
        )}

        {isFirstAccount && (
          <p style={{ fontSize: '11px', color: P.dim, marginBottom: '16px' }}>
            Esta será tu cuenta principal — podés cambiarlo más tarde.
          </p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '14px',
            background: loading ? `${P.green}70` : P.green,
            color: '#000',
            fontWeight: 700,
            fontSize: '15px',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'opacity 0.15s',
            letterSpacing: '0.01em',
          }}
        >
          {loading ? 'Creando...' : `Agregar ${config.label.toLowerCase()}`}
        </button>
      </ModalSheet>
    </Backdrop>
  );
}

// ─── Layout wrappers ──────────────────────────────────────────────────────────

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function ModalSheet({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        borderRadius: '24px 24px 0 0',
        padding: '20px 20px 36px',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '92vh',
        overflowY: 'auto',
        border: `1px solid ${P.border}`,
        borderBottom: 'none',
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        /* Scrollbar minimal */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
      {children}
    </div>
  );
}
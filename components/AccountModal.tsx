'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CreateAccountInput, SimpleAccount } from '../hooks/useSimpleSupabase';

interface AccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
  createAccount: (data: CreateAccountInput) => Promise<SimpleAccount | null>;
  isFirstAccount: boolean;
}

// ─── 3 grupos exactos ───────────────────────────────────────────────────────
type AccountGroup = 'liquid' | 'cash' | 'credit';

interface GroupOption {
  value: AccountGroup;
  supabaseType: 'liquid' | 'credit' | 'savings';
  label: string;
  icon: string;
  desc: string;
}

const GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'liquid',
    supabaseType: 'liquid',
    label: 'Cuenta líquida',
    icon: '🏦',
    desc: 'Banco, Mercado Pago — transferencias y débito',
  },
  {
    value: 'cash',
    supabaseType: 'liquid',
    label: 'Efectivo',
    icon: '💵',
    desc: 'Billetera física — sin vencimientos',
  },
  {
    value: 'credit',
    supabaseType: 'credit',
    label: 'Tarjeta de crédito',
    icon: '💳',
    desc: 'Cuotas — resta al disponible real',
  },
];

function validate(
  group: AccountGroup,
  name: string,
  balance: string,
  creditLimit: string,
  closingDay: string,
  dueDay: string,
): string | null {
  if (!name.trim()) return 'Ponele un nombre a la cuenta.';
  if (balance === '' || isNaN(Number(balance))) return 'Ingresá el saldo inicial.';
  if (group === 'credit') {
    if (!creditLimit || isNaN(Number(creditLimit)) || Number(creditLimit) <= 0)
      return 'Ingresá el límite de crédito.';
    const cd = Number(closingDay);
    const dd = Number(dueDay);
    if (!closingDay || cd < 1 || cd > 31) return 'El día de cierre debe estar entre 1 y 31.';
    if (!dueDay || dd < 1 || dd > 31) return 'El día de vencimiento debe estar entre 1 y 31.';
  }
  return null;
}

const parseAmount = (raw: string) =>
  Number(raw.replace(/\./g, '').replace(',', '.')) || 0;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="text-white/40 text-xs block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-white/25 text-[10px] mt-1 leading-tight">{hint}</p>}
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  placeholder = '0',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 pl-7 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#00C853]/40"
      />
    </div>
  );
}

function DayInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
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
      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#00C853]/40 text-center"
    />
  );
}

export default function AccountModal({
  onClose,
  onSuccess,
  createAccount,
  isFirstAccount,
}: AccountModalProps) {
  const [group, setGroup]             = useState<AccountGroup>('liquid');
  const [name, setName]               = useState('');
  const [balance, setBalance]         = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay]   = useState('');
  const [dueDay, setDueDay]           = useState('');
  const [isDefault, setIsDefault]     = useState(isFirstAccount);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleGroupChange = (g: AccountGroup) => {
    setGroup(g);
    setError(null);
    if (g === 'cash') setName('Efectivo');
    else if (name === 'Efectivo') setName('');
    if (g !== 'credit') {
      setCreditLimit('');
      setClosingDay('');
      setDueDay('');
    }
  };

  const handleSubmit = async () => {
    const err = validate(group, name, balance, creditLimit, closingDay, dueDay);
    if (err) { setError(err); return; }

    setLoading(true);
    setError(null);

    const selectedGroup = GROUP_OPTIONS.find(o => o.value === group)!;

    const payload: CreateAccountInput = {
      name: name.trim(),
      type: selectedGroup.supabaseType,
      balance: parseAmount(balance),
      is_default: isFirstAccount || isDefault,
      ...(group === 'credit' && {
        credit_limit: parseAmount(creditLimit),
        closing_day:  Number(closingDay),
        due_day:      Number(dueDay),
      }),
    };

    const result = await createAccount(payload);
    setLoading(false);

    if (result) {
      onSuccess();
    } else {
      setError('No se pudo crear la cuenta. Intentá de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-[#0f1612] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 pb-8 sm:pb-5 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-white font-semibold text-base">Nueva cuenta</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tipo de cuenta */}
        <div className="mb-5">
          <label className="text-white/40 text-xs block mb-1.5">Tipo de cuenta</label>
          <div className="flex flex-col gap-2">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleGroupChange(opt.value)}
                className={`flex items-center gap-3 rounded-xl p-3 border text-left transition-all ${
                  group === opt.value
                    ? 'bg-[#00C853]/10 border-[#00C853]/40'
                    : 'bg-white/5 border-white/8 hover:border-white/20'
                }`}
              >
                <span className="text-xl leading-none">{opt.icon}</span>
                <div className="min-w-0 flex-1">
                  <span className={`text-sm font-medium block ${group === opt.value ? 'text-[#69F0AE]' : 'text-white/70'}`}>
                    {opt.label}
                  </span>
                  <span className="text-white/30 text-[11px] leading-tight block">
                    {opt.desc}
                  </span>
                </div>
                <span className={`shrink-0 w-4 h-4 rounded-full border-2 transition-colors ${
                  group === opt.value ? 'border-[#00C853] bg-[#00C853]' : 'border-white/20'
                }`} />
              </button>
            ))}
          </div>
        </div>

        {/* Nombre */}
        <Field
          label={group === 'cash' ? 'Nombre (opcional)' : 'Nombre de la cuenta'}
          hint={group === 'cash' ? 'Por defecto "Efectivo"' : undefined}
        >
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={
              group === 'liquid' ? 'Ej: Santander, Mercado Pago, Brubank' :
              group === 'cash'   ? 'Efectivo' :
              'Ej: Visa Santander, Naranja X'
            }
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#00C853]/40"
          />
        </Field>

        {/* Campos líquida / efectivo */}
        {(group === 'liquid' || group === 'cash') && (
          <Field label="Saldo actual" hint="Su saldo suma al total disponible">
            <AmountInput value={balance} onChange={setBalance} />
          </Field>
        )}

        {/* Campos tarjeta de crédito */}
        {group === 'credit' && (
          <>
            <Field
              label="Límite de crédito"
              hint="Se usa para calcular el porcentaje de uso"
            >
              <AmountInput value={creditLimit} onChange={setCreditLimit} />
            </Field>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-white/40 text-xs block mb-1.5">Día de cierre</label>
                <DayInput value={closingDay} onChange={setClosingDay} placeholder="Ej: 20" />
                <p className="text-white/25 text-[10px] mt-1">Cierre del resumen</p>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1.5">Día de vencimiento</label>
                <DayInput value={dueDay} onChange={setDueDay} placeholder="Ej: 10" />
                <p className="text-white/25 text-[10px] mt-1">Fecha de pago</p>
              </div>
            </div>

            <Field
              label="Deuda actual (opcional)"
              hint="Cuotas impagas al momento de registrar — restan al disponible real"
            >
              <AmountInput value={balance} onChange={setBalance} placeholder="0" />
            </Field>

            <div className="mb-4 rounded-xl bg-white/5 border border-white/8 px-3 py-2.5">
              <p className="text-white/40 text-[11px] leading-relaxed">
                Las cuotas de tarjeta <span className="text-white/60">no suman</span> al total disponible — restan según las cuotas impagas del próximo vencimiento.
              </p>
            </div>
          </>
        )}

        {/* Toggle cuenta principal */}
        {!isFirstAccount && group !== 'cash' && (
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-white/70 text-sm">Usar como cuenta principal</p>
              <p className="text-white/30 text-xs">Los gastos del chat se registran acá por defecto</p>
            </div>
            <button
              onClick={() => setIsDefault(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${isDefault ? 'bg-[#00C853]' : 'bg-white/15'}`}
              aria-pressed={isDefault}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isDefault ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        )}

        {isFirstAccount && (
          <p className="text-white/30 text-xs mb-4">
            Esta será tu cuenta principal ya que es la primera que creás.
          </p>
        )}

        {error && <p className="text-[#FF5252] text-xs mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-[#00C853] text-black font-semibold py-3 rounded-xl disabled:opacity-50 transition-opacity text-sm"
        >
          {loading ? 'Creando...' : 'Crear cuenta'}
        </button>
      </div>
    </div>
  );
}

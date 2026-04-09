'use client';

// ============================================================
// AI Wallet — Panel de Cuentas rediseñado
// components/AccountsPanel.tsx
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useAccounts } from '../hooks/useAccounts';
import AccountModal from './AccountModal';
import { PALETTE, inferKind } from '../lib/accountTypes';
import type { Account, Installment } from '../lib/types';
import type { SimpleAccount, CreateAccountInput } from '../hooks/useSimpleSupabase';

const P = PALETTE;

interface AccountsPanelProps {
  onNavigateToChat: () => void;
}

// ─── Formato ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Tarjeta "disponible real" ────────────────────────────────────────────────

function DisponibleCard({
  realDisponible,
  totalLiquid,
  totalCreditDebt,
  installmentsThisMonth,
}: {
  realDisponible: number;
  totalLiquid: number;
  totalCreditDebt: number;
  installmentsThisMonth: number;
}) {
  const isNeg = realDisponible < 0;
  const color = isNeg ? P.red : realDisponible === 0 ? P.dim : P.green;

  return (
    <div style={{
      background: P.card,
      borderRadius: '20px',
      padding: '22px 20px',
      marginBottom: '20px',
      border: `1px solid ${P.border}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: isNeg
          ? 'radial-gradient(ellipse at 50% 0%, rgba(255,82,82,0.06) 0%, transparent 70%)'
          : 'radial-gradient(ellipse at 50% 0%, rgba(0,230,118,0.06) 0%, transparent 70%)',
      }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: '10px', color: P.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 500 }}>
          Disponible real
        </div>
        <div style={{ fontSize: '38px', fontWeight: 800, color, lineHeight: 1, marginBottom: '12px', letterSpacing: '-0.02em' }}>
          {fmt(realDisponible)}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {totalLiquid > 0 && (
            <span style={{ fontSize: '12px', color: P.dim }}>
              <span style={{ color: P.green }}>+{fmt(totalLiquid)}</span> efectivo
            </span>
          )}
          {totalCreditDebt > 0 && (
            <span style={{ fontSize: '12px', color: P.dim }}>
              <span style={{ color: P.red }}>−{fmt(totalCreditDebt)}</span> tarjetas
            </span>
          )}
        </div>
        {installmentsThisMonth > 0 && (
          <div style={{
            marginTop: '10px', padding: '6px 10px',
            background: 'rgba(255,215,64,0.08)', borderRadius: '8px',
            border: '1px solid rgba(255,215,64,0.15)',
            fontSize: '11px', color: P.yellow,
            display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            ⚡ {fmt(installmentsThisMonth)} en cuotas este mes
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edición inline de balance ────────────────────────────────────────────────

function InlineBalance({
  accountId,
  currentBalance,
  onUpdate,
}: {
  accountId: string;
  currentBalance: number;
  onUpdate: (id: string, val: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDisplay(String(currentBalance));
      setTimeout(() => inputRef.current?.select(), 10);
    }
  }, [editing, currentBalance]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setDisplay(raw ? Number(raw).toLocaleString('es-AR') : '');
  };

  const commit = async () => {
    const num = Number(display.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num) && num >= 0) await onUpdate(accountId, num);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: P.dim, fontSize: '13px' }}>$</span>
        <input
          ref={inputRef}
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          style={{
            width: '110px',
            background: 'rgba(0,230,118,0.08)',
            border: `1px solid ${P.green}60`,
            borderRadius: '8px',
            color: P.white,
            padding: '5px 8px 5px 20px',
            fontSize: '13px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Tocá para editar"
      style={{
        background: 'none', border: '1px solid transparent', cursor: 'pointer',
        color: P.green, fontWeight: 700, fontSize: '14px',
        padding: '4px 6px', borderRadius: '6px', fontFamily: 'inherit',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => ((e.currentTarget).style.borderColor = `${P.green}30`)}
      onMouseLeave={e => ((e.currentTarget).style.borderColor = 'transparent')}
    >
      {fmt(currentBalance)}
    </button>
  );
}

// ─── Fila de cuenta individual ────────────────────────────────────────────────

function AccountRow({
  account,
  installmentsThisMonth,
  onUpdateBalance,
}: {
  account: Account;
  installmentsThisMonth: number;
  onUpdateBalance: (id: string, val: number) => Promise<boolean>;
}) {
  const config    = inferKind(account.type, account.name);
  const isCredit  = account.type === 'credit';
  const available = isCredit ? Math.max(0, (account.credit_limit ?? 0) - account.balance) : null;
  const usagePct  = isCredit && account.credit_limit
    ? Math.min(100, (account.balance / account.credit_limit) * 100)
    : null;

  return (
    <div style={{
      background: P.bg, border: `1px solid ${P.border}`, borderRadius: '14px',
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Ícono */}
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
          background: isCredit ? P.redDim : P.greenDim,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
        }}>
          {account.icon ?? config.emoji}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: P.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </span>
            {account.is_default && (
              <span style={{
                fontSize: '9px', color: P.green, background: P.greenDim,
                padding: '1px 5px', borderRadius: '4px', fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0,
              }}>
                DEFAULT
              </span>
            )}
          </div>
          {isCredit ? (
            <div style={{ fontSize: '12px', color: P.dim }}>
              <span style={{ color: P.red }}>Deuda: {fmt(account.balance)}</span>
              {available !== null && (
                <span style={{ marginLeft: '8px', color: `${P.white}50` }}>Disp: {fmt(available)}</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: P.dim }}>{config.sublabel}</div>
          )}
        </div>

        {/* Balance */}
        {config.inlineEditable ? (
          <InlineBalance accountId={account.id} currentBalance={account.balance} onUpdate={onUpdateBalance} />
        ) : (
          <span style={{ color: P.red, fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
            {fmt(account.balance)}
          </span>
        )}
      </div>

      {/* Barra de uso + info de tarjeta */}
      {usagePct !== null && (
        <div>
          <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${usagePct}%`, borderRadius: '2px',
              background: usagePct > 80 ? P.red : usagePct > 50 ? P.yellow : P.green,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            {(account.closing_day || account.due_day) && (
              <span style={{ fontSize: '10px', color: P.dim }}>
                {account.closing_day && `Cierre día ${account.closing_day}`}
                {account.closing_day && account.due_day && ' · '}
                {account.due_day && `Vence día ${account.due_day}`}
              </span>
            )}
            {installmentsThisMonth > 0 && (
              <span style={{ fontSize: '10px', color: P.yellow }}>⚡ {fmt(installmentsThisMonth)} este mes</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sección agrupada ─────────────────────────────────────────────────────────

function AccountSection({
  title, accounts, installments, onUpdateBalance, total, totalLabel, totalColor,
}: {
  title: string;
  accounts: Account[];
  installments: Installment[];
  onUpdateBalance: (id: string, val: number) => Promise<boolean>;
  total: number;
  totalLabel?: string;
  totalColor?: string;
}) {
  if (accounts.length === 0) return null;
  const ym = currentYM();

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: P.dim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </span>
        {total > 0 && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: totalColor ?? P.dim }}>
            {totalLabel && `${totalLabel} `}{fmt(total)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {accounts.map(acc => {
          const accInst = installments
            .filter(i => i.account_id === acc.id && i.due_month === ym && !i.is_paid)
            .reduce((s, i) => s + i.amount, 0);
          return (
            <AccountRow key={acc.id} account={acc} installmentsThisMonth={accInst} onUpdateBalance={onUpdateBalance} />
          );
        })}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const CHIPS = [
  { label: '💵 Tengo efectivo',    msg: 'Quiero registrar mi efectivo disponible' },
  { label: '📱 Mercado Pago',       msg: 'Quiero agregar mi billetera de Mercado Pago' },
  { label: '🏦 Cuenta bancaria',    msg: 'Quiero agregar mi cuenta bancaria' },
  { label: '💳 Tengo tarjeta',      msg: 'Quiero agregar mi tarjeta de crédito' },
];

function EmptyState({ onChipClick }: { onChipClick: (msg: string) => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px 32px' }}>
      <div style={{
        width: '64px', height: '64px', background: P.greenDim, borderRadius: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', margin: '0 auto 16px', border: `1px solid ${P.green}30`,
      }}>
        🏦
      </div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: P.white, marginBottom: '6px' }}>
        Cargá tu primera cuenta
      </div>
      <div style={{ fontSize: '13px', color: P.dim, marginBottom: '28px', lineHeight: 1.5 }}>
        Para ver cuánto dinero real tenés disponible — sin estimaciones.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
        {CHIPS.map(chip => (
          <button
            key={chip.label}
            onClick={() => onChipClick(chip.msg)}
            style={{
              padding: '9px 14px', borderRadius: '20px', border: `1px solid ${P.border}`,
              background: P.card, color: P.mid, fontSize: '12px', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget).style.borderColor = `${P.green}40`; (e.currentTarget).style.color = P.white; }}
            onMouseLeave={e => { (e.currentTarget).style.borderColor = P.border; (e.currentTarget).style.color = P.mid; }}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function AccountsPanel({ onNavigateToChat }: AccountsPanelProps) {
  const { accounts, installments, summary, loading, error, createAccount, updateBalance, refresh } = useAccounts();
  const [showModal, setShowModal] = useState(false);

  const liquid  = accounts.filter(a => a.type === 'liquid');
  const credit  = accounts.filter(a => a.type === 'credit');
  const savings = accounts.filter(a => a.type === 'savings');
  const hasAny  = accounts.length > 0;

  const handleChipClick = (msg: string) => {
    onNavigateToChat();
    setTimeout(() => window.dispatchEvent(new CustomEvent('ai-wallet-prefill', { detail: { message: msg } })), 120);
  };

  // Adaptar createAccount del hook (devuelve boolean) al modal (espera SimpleAccount | null)
  const handleCreateAccount = async (data: CreateAccountInput): Promise<SimpleAccount | null> => {
    const ok = await createAccount({ ...data, is_active: true, currency: 'ARS', is_default: data.is_default ?? false });
    if (!ok) return null;
    // Refrescar y devolver objeto mínimo para la pantalla de éxito
    await refresh();
    return {
      id:           'new',
      name:         data.name,
      type:         data.type,
      balance:      data.balance,
      credit_limit: data.credit_limit ?? null,
      is_default:   data.is_default ?? false,
      currency:     'ARS',
    } as SimpleAccount;
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{
          width: '32px', height: '32px', border: `2px solid ${P.border}`,
          borderTopColor: P.green, borderRadius: '50%', margin: '0 auto 12px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '13px', color: P.dim }}>Cargando cuentas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: P.red, marginBottom: '12px' }}>{error}</div>
        <button
          onClick={() => refresh()}
          style={{
            padding: '8px 16px', borderRadius: '8px', background: P.greenDim,
            border: `1px solid ${P.green}40`, color: P.green, fontSize: '13px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: P.white, margin: 0 }}>Mis Cuentas</h2>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 14px', borderRadius: '20px',
            background: P.greenDim, border: `1px solid ${P.green}40`,
            color: P.green, fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Nueva
        </button>
      </div>

      {/* Disponible real */}
      {hasAny && (
        <DisponibleCard
          realDisponible={summary.realDisponible}
          totalLiquid={summary.totalLiquid}
          totalCreditDebt={summary.totalCreditDebt}
          installmentsThisMonth={summary.installmentsThisMonth}
        />
      )}

      {/* Empty */}
      {!hasAny && <EmptyState onChipClick={handleChipClick} />}

      {/* Secciones */}
      <AccountSection
        title="💵 Efectivo y cuentas"
        accounts={liquid}
        installments={installments}
        onUpdateBalance={updateBalance}
        total={summary.totalLiquid}
        totalColor={P.green}
      />
      <AccountSection
        title="💳 Tarjetas"
        accounts={credit}
        installments={installments}
        onUpdateBalance={updateBalance}
        total={summary.totalCreditDebt}
        totalLabel="Deuda:"
        totalColor={P.red}
      />
      {savings.length > 0 && (
        <>
          <AccountSection
            title="🏦 Ahorro"
            accounts={savings}
            installments={installments}
            onUpdateBalance={updateBalance}
            total={summary.totalSavings}
            totalColor={P.mid}
          />
          <p style={{ fontSize: '11px', color: P.dim, marginTop: '-16px', marginBottom: '20px' }}>
            El ahorro no impacta en tu disponible diario.
          </p>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <AccountModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {}}
          createAccount={handleCreateAccount}
          isFirstAccount={!hasAny}
        />
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { CreditCard, Landmark, AlertTriangle, TrendingUp, TrendingDown, Wallet, ChevronRight, Plus, PiggyBank } from 'lucide-react';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import AccountModal from './AccountModal';

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const getEmojiCategoria = (categoria: string): string => {
  const mapa: Record<string, string> = {
    alimentacion: '🍔', comida: '🍔',
    transporte: '🚌', nafta: '🚌',
    salidas: '🎉', entretenimiento: '🎉',
    sueldo: '💼', salario: '💼',
    ahorro: '💰',
    supermercado: '🛒', super: '🛒',
    servicios: '💡', luz: '💡', gas: '💡',
    suscripciones: '📱', netflix: '📱',
    salud: '💊', farmacia: '💊', medico: '💊',
    ropa: '👕', zapatillas: '👟',
    mascotas: '🐕', perro: '🐕', gato: '🐈',
    gym: '💪', gimnasio: '💪',
    educacion: '📚', curso: '📚',
    viaje: '✈️', vacaciones: '🏖️',
    regalo: '🎁',
    otros: '📦',
  };
  const key = Object.keys(mapa).find(k => categoria.toLowerCase().includes(k));
  return key ? mapa[key] : '📦';
};

interface DashboardTabProps {
  selectedMonth: string;
  onNavigateToChat?: () => void;
  onNavigateToMetas?: () => void;
}

export default function DashboardTab({ selectedMonth, onNavigateToChat, onNavigateToMetas }: DashboardTabProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);

  const { transactions, goals, accounts, installments, createAccount, refresh } =
    useSimpleAdaptedData(selectedMonth);

  // ─── Date refs ───────────────────────────────────────────
  const hoy = new Date();
  const thisMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const nextDate  = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  // ─── Account calculations ─────────────────────────────────
  const hasAccounts = accounts.length > 0;

  const liquidTotal = accounts
    .filter(a => a.type === 'liquid' || a.type === 'savings')
    .reduce((s, a) => s + a.balance, 0);

  // Credit debt = sum of all unpaid installments (source of truth, NOT account.balance)
  const creditDebt = installments
    .filter(i => !i.is_paid)
    .reduce((s, i) => s + i.amount, 0);

  const realAvailable = liquidTotal - creditDebt;

  // Per-account credit debt breakdown (for account list display)
  const debtByAccount: Record<string, number> = {};
  installments.filter(i => !i.is_paid).forEach(i => {
    debtByAccount[i.account_id] = (debtByAccount[i.account_id] || 0) + i.amount;
  });

  // ─── Installments pressure ────────────────────────────────
  const installmentsThisMonth = installments.filter(i => i.due_month === thisMonth && !i.is_paid);
  const installmentsNextMonth = installments.filter(i => i.due_month === nextMonth && !i.is_paid);
  const totalThisMonth = installmentsThisMonth.reduce((s, i) => s + i.amount, 0);
  const totalNextMonth = installmentsNextMonth.reduce((s, i) => s + i.amount, 0);

  // ─── Transaction totals ───────────────────────────────────
  const totalIngresos = transactions
    .filter(t => t.tipo === 'ingreso')
    .reduce((s, t) => s + Number(t.monto), 0);

  const totalGastos = transactions
    .filter(t => t.tipo === 'gasto')
    .reduce((s, t) => s + Math.abs(Number(t.monto)), 0);

  const dineroDisponible = totalIngresos - totalGastos;

  // ─── Hero KPI — ratio-based thresholds ───────────────────
  //
  // Use realAvailable when accounts exist; fall back to income-expenses
  // for users who haven't set up accounts yet.
  //
  // Ratio = heroAmount / monthly_income
  // This makes the threshold meaningful regardless of ARS inflation.
  const heroAmount   = hasAccounts ? realAvailable : dineroDisponible;
  const incomeRef    = totalIngresos > 0 ? totalIngresos : 1;
  const ratio        = heroAmount / incomeRef;

  type HeroEstado = 'solido' | 'bien' | 'cuidado' | 'justo' | 'mal';

  // ratio >= 0.30 → solid  |  >= 0.15 → ok  |  >= 0.05 → careful  |  >= 0 → tight  |  < 0 → red
  const heroEstado: HeroEstado =
    ratio >= 0.30 ? 'solido'  :
    ratio >= 0.15 ? 'bien'    :
    ratio >= 0.05 ? 'cuidado' :
    ratio >= 0    ? 'justo'   : 'mal';

  const heroConfig: Record<HeroEstado, {
    bg: string; border: string; amountColor: string;
    badge: string; badgeBg: string; message: string; sub: string;
  }> = {
    solido: {
      bg: 'bg-[#061a0e]', border: 'border-[#00C853]/25', amountColor: 'text-[#69F0AE]',
      badge: 'Estás sólido', badgeBg: 'bg-[#00C853]/15 text-[#69F0AE]',
      message: 'Podés gastar con tranquilidad.',
      sub: 'Tu posición financiera es saludable.',
    },
    bien: {
      bg: 'bg-[#0A1F14]', border: 'border-[#00C853]/15', amountColor: 'text-[#69F0AE]',
      badge: 'Vas bien', badgeBg: 'bg-[#00C853]/10 text-[#69F0AE]',
      message: 'Vas bien, pero no te relajes.',
      sub: 'Seguí el ritmo hasta fin de mes.',
    },
    cuidado: {
      bg: 'bg-[#1C1600]', border: 'border-[#FFD740]/20', amountColor: 'text-[#FFD740]',
      badge: 'Poco margen', badgeBg: 'bg-[#FFD740]/10 text-[#FFD740]',
      message: 'Pensalo dos veces antes de gastar.',
      sub: 'Un gasto grande puede complicarte.',
    },
    justo: {
      bg: 'bg-[#1C1000]', border: 'border-[#FF6D00]/20', amountColor: 'text-[#FF6D00]',
      badge: 'Muy justo', badgeBg: 'bg-[#FF6D00]/10 text-[#FF6D00]',
      message: 'Estás muy justo. Bajá gastos ya.',
      sub: 'Casi no queda margen de maniobra.',
    },
    mal: {
      bg: 'bg-[#1C0505]', border: 'border-[#FF5252]/20', amountColor: 'text-[#FF5252]',
      badge: 'Estás en rojo', badgeBg: 'bg-[#FF5252]/10 text-[#FF5252]',
      message: 'Frená urgente. Tu deuda supera tu efectivo.',
      sub: 'Revisá las cuotas pendientes.',
    },
  };

  const cfg = heroConfig[heroEstado];

  // ─── Goals & activity ─────────────────────────────────────
  const topMetas = goals.slice(0, 2);

  const ultimasTransacciones = [...transactions]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 5);

  const fechaRelativa = (dateStr: string): string => {
    const fecha = new Date(dateStr);
    const diff  = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7)   return `Hace ${diff} días`;
    return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  // ─── Account icon helper ──────────────────────────────────
  const accountIcon = (type: string) => {
    if (type === 'credit')  return <CreditCard  size={14} className="text-white/30 flex-shrink-0" />;
    if (type === 'savings') return <PiggyBank   size={14} className="text-white/30 flex-shrink-0" />;
    return                         <Landmark    size={14} className="text-white/30 flex-shrink-0" />;
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-6">

      {/* ═══ 1. HERO ══════════════════════════════════════════════════════════ */}
      <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-5`}>
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-4 ${cfg.badgeBg}`}>
          {cfg.badge}
        </span>

        <div className="mb-3">
          <p className="text-white/40 text-xs mb-1">
            {hasAccounts ? 'Disponible real' : 'Libre este mes'}
          </p>
          <p className={`text-4xl font-bold tracking-tight ${cfg.amountColor}`}>
            ${heroAmount.toLocaleString('es-AR')}
          </p>
        </div>

        <p className="text-white/90 font-semibold text-base leading-snug">{cfg.message}</p>
        <p className="text-white/35 text-xs mt-1">{cfg.sub}</p>
      </div>

      {/* ═══ 2. ACCOUNTS ══════════════════════════════════════════════════════ */}
      <div className="bg-[#111714] border border-white/5 rounded-2xl p-4">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-white/70 font-medium text-sm">
            {hasAccounts ? 'Mis cuentas' : 'Conectá tus cuentas'}
          </p>
          <button
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-1 text-[#00C853]/70 text-xs hover:text-[#00C853] transition-colors"
          >
            <Plus size={12} />
            Nueva
          </button>
        </div>

        {!hasAccounts ? (
          /* Empty state nudge */
          <div
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-3 cursor-pointer py-2"
          >
            <span className="text-2xl">🏦</span>
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-sm">
                Agregá tu primera cuenta para ver tu dinero real
              </p>
              <p className="text-white/25 text-xs mt-0.5">
                Efectivo, banco o tarjeta de crédito
              </p>
            </div>
            <ChevronRight size={16} className="text-white/20 flex-shrink-0" />
          </div>
        ) : (
          /* Account list */
          <div className="space-y-0">
            {accounts.map((acc, idx) => {
              // For credit accounts: show the outstanding installment debt, not account.balance
              const debt           = acc.type === 'credit' ? (debtByAccount[acc.id] || 0) : 0;
              const displayAmount  = acc.type === 'credit' ? -debt : acc.balance;
              const isNegative     = displayAmount < 0;

              return (
                <div
                  key={acc.id}
                  className={`flex items-center justify-between py-2.5 ${
                    idx < accounts.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {accountIcon(acc.type)}
                    <span className="text-white/70 text-sm truncate">{acc.name}</span>
                    {acc.is_default && (
                      <span className="text-[#00C853]/40 text-xs flex-shrink-0">· principal</span>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-2 text-right">
                    <p className={`text-sm font-medium ${isNegative ? 'text-[#FF5252]' : 'text-white/80'}`}>
                      {isNegative ? '-' : ''}${Math.abs(displayAmount).toLocaleString('es-AR')}
                    </p>
                    {acc.type === 'credit' && debt === 0 && (
                      <p className="text-white/25 text-xs">sin deuda</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Totals footer */}
            <div className="pt-3 mt-1 border-t border-white/8 grid grid-cols-2 gap-2">
              <div className="bg-white/5 rounded-xl px-3 py-2">
                <p className="text-white/30 text-xs mb-1">Efectivo total</p>
                <p className="text-white font-semibold text-sm">
                  ${liquidTotal.toLocaleString('es-AR')}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2">
                <p className="text-white/30 text-xs mb-1">Deuda cuotas</p>
                <p className={`font-semibold text-sm ${creditDebt > 0 ? 'text-[#FF5252]' : 'text-white/30'}`}>
                  {creditDebt > 0 ? `-$${creditDebt.toLocaleString('es-AR')}` : '$0'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. FUTURE PRESSURE ══════════════════════════════════════════════ */}
      {(totalThisMonth > 0 || totalNextMonth > 0) && (
        <div className="bg-[#1C1000] border border-[#FF6D00]/20 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-[#FF6D00]" />
            <p className="text-[#FF6D00] text-xs font-semibold uppercase tracking-wide">
              Presión de cuotas
            </p>
          </div>

          {totalThisMonth > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-white/60 text-sm">Este mes ({MESES[hoy.getMonth()]})</p>
              <p className="text-[#FF5252] font-semibold text-sm">
                -${totalThisMonth.toLocaleString('es-AR')}
              </p>
            </div>
          )}

          {totalNextMonth > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-white/40 text-sm">
                En {MESES[nextDate.getMonth()]} se te juntan
              </p>
              <p className="text-white/55 font-medium text-sm">
                -${totalNextMonth.toLocaleString('es-AR')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ 4. SECONDARY METRICS ════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Ingresos', value: totalIngresos, color: 'text-[#69F0AE]', icon: <TrendingUp  size={11} /> },
          { label: 'Gastos',   value: totalGastos,   color: 'text-[#FF5252]', icon: <TrendingDown size={11} /> },
          { label: 'Neto',     value: Math.max(0, dineroDisponible), color: 'text-white/60', icon: <Wallet size={11} /> },
        ].map(item => (
          <div key={item.label} className="bg-[#111714] border border-white/5 rounded-xl p-3 text-center">
            <div className={`flex items-center justify-center gap-1 mb-1 ${item.color} opacity-50`}>
              {item.icon}
              <p className="text-white/30 text-xs">{item.label}</p>
            </div>
            <p className={`${item.color} font-bold text-sm`}>
              ${item.value.toLocaleString('es-AR')}
            </p>
          </div>
        ))}
      </div>

      {/* ═══ 5. GOALS ════════════════════════════════════════════════════════ */}
      {topMetas.length > 0 && (
        <div className="bg-[#111714] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/70 font-medium text-sm">Mis metas</p>
            <button
              onClick={() => onNavigateToMetas?.()}
              className="text-[#00C853]/70 text-xs flex items-center gap-0.5"
            >
              Ver todas <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-4">
            {topMetas.map(meta => {
              const progreso = Math.min((meta.montoActual / meta.montoObjetivo) * 100, 100);
              return (
                <div key={meta.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{meta.icono}</span>
                      <span className="text-white/80 text-sm">{meta.titulo}</span>
                    </div>
                    <span className="text-white/30 text-xs">{Math.round(progreso)}%</span>
                  </div>
                  <div className="h-1 bg-white/8 rounded-full">
                    <div
                      className="h-full bg-[#00C853] rounded-full transition-all"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                  <p className="text-white/25 text-xs mt-1">
                    Te faltan ${(meta.montoObjetivo - meta.montoActual).toLocaleString('es-AR')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 6. RECENT ACTIVITY ══════════════════════════════════════════════ */}
      {ultimasTransacciones.length > 0 && (
        <div className="bg-[#111714] border border-white/5 rounded-2xl p-4">
          <p className="text-white/70 font-medium text-sm mb-3">Actividad reciente</p>
          <div className="space-y-3">
            {ultimasTransacciones.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-lg">{getEmojiCategoria(t.categoria?.id || 'otros')}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm truncate">{t.descripcion}</p>
                  <p className="text-white/25 text-xs">{fechaRelativa(t.fecha)}</p>
                </div>
                <p className={`text-sm font-medium flex-shrink-0 ${
                  t.tipo === 'ingreso' ? 'text-[#69F0AE]' : 'text-white/55'
                }`}>
                  {t.tipo === 'ingreso' ? '+' : '-'}${Math.abs(Number(t.monto)).toLocaleString('es-AR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 7. CHAT CTA ═════════════════════════════════════════════════════ */}
      <div
        onClick={() => onNavigateToChat?.()}
        className="bg-[#111714] border border-white/5 rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:opacity-80 hover:border-[#00C853]/20 transition-colors"
      >
        <span className="text-xl">💬</span>
        <div>
          <p className="text-white/80 font-medium text-sm">Hablá con tu coach</p>
          <p className="text-white/30 text-xs">Registrá gastos, consultá o pedí análisis</p>
        </div>
        <ChevronRight size={16} className="ml-auto text-white/20 flex-shrink-0" />
      </div>

      {/* ═══ ACCOUNT MODAL ═══════════════════════════════════════════════════ */}
      {showAccountModal && (
        <AccountModal
          isFirstAccount={!hasAccounts}
          createAccount={createAccount}
          onClose={() => setShowAccountModal(false)}
          onSuccess={() => {
            setShowAccountModal(false);
            refresh();
          }}
        />
      )}

    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight, ArrowRight, TrendingUp, TrendingDown,
  CreditCard, Landmark, PiggyBank, Zap,
} from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import AccountModal from './AccountModal';
import { supabase } from '../lib/supabase';

// ─── Props ────────────────────────────────────────────────────────────────────
// accounts ya NO llega como prop — viene de useSimpleSupabase directamente.
// Esto garantiza que crear una cuenta actualiza el hero en tiempo real.

interface DashboardTabProps {
  selectedMonth: string;
  onNavigateToChat: () => void;
  onNavigateToMetas: () => void;
  onNavigateToBudgets?: () => void;
  // accounts prop mantenida por compatibilidad con page.tsx pero NO se usa internamente
  accounts?: unknown[];
}

interface OnboardingData {
  nombre: string;
  ingreso_mensual: number;
  objetivo_ahorro: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(0)}k`;
  return `$${Math.round(abs).toLocaleString('es-AR')}`;
};

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const EMOJI_CAT: Record<string, string> = {
  alimentacion: '🍔', comida: '🍔', supermercado: '🛒',
  transporte: '🚌', nafta: '⛽', salidas: '🎉', entretenimiento: '🎬',
  sueldo: '💼', salario: '💼', ahorro: '💰', servicios: '💡',
  suscripciones: '📱', salud: '💊', farmacia: '💊', ropa: '👕',
  mascotas: '🐕', gym: '💪', educacion: '📚', viaje: '✈️', otros: '📦',
};

const getEmoji = (cat: string) => {
  const key = Object.keys(EMOJI_CAT).find(k => cat.toLowerCase().includes(k));
  return key ? EMOJI_CAT[key] : '📦';
};

const fechaRel = (d: string): string => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7)  return `Hace ${diff}d`;
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

// ─── Tipos internos de cuenta (del hook) ──────────────────────────────────────

type AccType = 'liquid' | 'credit' | 'savings';

interface SimpleAcc {
  id: string;
  name: string;
  type: AccType;
  balance: number;
  credit_limit?: number | null;
  color?: string | null;
  is_default: boolean;
}

const accountIcon = (type: AccType) => {
  if (type === 'credit')  return <CreditCard  size={13} className="text-white/30 shrink-0" />;
  if (type === 'savings') return <PiggyBank   size={13} className="text-white/30 shrink-0" />;
  return                         <Landmark    size={13} className="text-white/30 shrink-0" />;
};

// ─── Estado visual ─────────────────────────────────────────────────────────────

type Estado = 'sin_datos' | 'sin_ingreso' | 'estimacion' | 'bien' | 'cuidado' | 'mal';

interface EstadoCfg {
  color: string; glow: string; badge: string;
  badgeClass: string; heroLabel: string;
}

const ESTADO_CFG: Record<Estado, EstadoCfg> = {
  sin_datos:  { color: 'rgba(255,255,255,0.2)', glow: 'transparent', badge: 'Empecemos',     badgeClass: 'text-white/40 bg-white/5 border-white/10',                    heroLabel: 'Configurando...' },
  sin_ingreso:{ color: 'rgba(255,255,255,0.3)', glow: 'transparent', badge: 'Falta ingreso',  badgeClass: 'text-white/50 bg-white/6 border-white/12',                    heroLabel: '¿Cuánto ganás?' },
  estimacion: { color: '#69F0AE',               glow: 'rgba(105,240,174,0.12)', badge: 'Estimación', badgeClass: 'text-[#69F0AE]/70 bg-[#00C853]/10 border-[#00C853]/20', heroLabel: 'Disponible estimado' },
  bien:       { color: '#00E676',               glow: 'rgba(0,230,118,0.10)',   badge: 'Vas bien',   badgeClass: 'text-[#00E676] bg-[#00E676]/10 border-[#00E676]/25',    heroLabel: 'Disponible real' },
  cuidado:    { color: '#FFD740',               glow: 'rgba(255,215,64,0.10)',  badge: 'Cuidado',    badgeClass: 'text-[#FFD740] bg-[#FFD740]/10 border-[#FFD740]/20',    heroLabel: 'Disponible real' },
  mal:        { color: '#FF5252',               glow: 'rgba(255,82,82,0.10)',   badge: 'Estás justo',badgeClass: 'text-[#FF5252] bg-[#FF5252]/10 border-[#FF5252]/20',    heroLabel: 'Disponible real' },
};

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function AlertPill({ icon, text, color, onClick }: {
  icon: React.ReactNode; text: string; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left w-full hover:brightness-110 active:scale-[.98] transition-all"
      style={{ background: `${color}0D`, borderColor: `${color}25` }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-xs leading-snug flex-1" style={{ color: `${color}CC` }}>{text}</span>
      {onClick && <ChevronRight size={11} style={{ color: `${color}50` }} className="shrink-0" />}
    </button>
  );
}

function GoalRow({ icono, titulo, pct, diasRestantes }: {
  icono: string; titulo: string; pct: number; diasRestantes?: number;
}) {
  const color = pct >= 75 ? '#00E676' : pct >= 40 ? '#FFD740' : '#FF6D00';
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0">
      <span className="text-base shrink-0">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white/65 text-sm truncate">{titulo}</p>
        {diasRestantes !== undefined && (
          <p className="text-white/25 text-[10px]">{diasRestantes}d restantes</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-16 h-1 bg-white/8 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
        </div>
        <span className="text-[11px] tabular-nums w-8 text-right" style={{ color: `${color}99` }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

function CuotasCard({ esteMes, proxMes, onChat }: {
  esteMes: number; proxMes: number; onChat: () => void;
}) {
  if (esteMes === 0 && proxMes === 0) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Cuotas pendientes</p>
        <CreditCard size={12} className="text-white/20" />
      </div>
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: esteMes > 0 ? 'rgba(255,82,82,0.06)' : 'rgba(255,255,255,0.03)', border: esteMes > 0 ? '1px solid rgba(255,82,82,0.15)' : '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-white/30 text-[10px] mb-1">Este mes</p>
          <p className="text-base font-bold tabular-nums" style={{ color: esteMes > 0 ? '#FF5252' : 'rgba(255,255,255,0.2)' }}>
            {esteMes > 0 ? fmt(esteMes) : '—'}
          </p>
          {esteMes > 0 && <p className="text-[10px] text-white/25 mt-0.5">comprometido</p>}
        </div>
        <div className="rounded-xl px-3 py-2.5"
          style={{ background: proxMes > 0 ? 'rgba(255,215,64,0.05)' : 'rgba(255,255,255,0.03)', border: proxMes > 0 ? '1px solid rgba(255,215,64,0.12)' : '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-white/30 text-[10px] mb-1">Próximo mes</p>
          <p className="text-base font-bold tabular-nums" style={{ color: proxMes > 0 ? '#FFD740' : 'rgba(255,255,255,0.2)' }}>
            {proxMes > 0 ? fmt(proxMes) : '—'}
          </p>
          {proxMes > 0 && <p className="text-[10px] text-white/25 mt-0.5">se viene</p>}
        </div>
      </div>
      {esteMes > 0 && (
        <button onClick={onChat} className="w-full text-center py-2.5 border-t border-white/[0.04] text-[11px] text-white/30 hover:text-white/50 transition-colors">
          Ver detalle de cuotas →
        </button>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function DashboardTab({
  selectedMonth,
  onNavigateToChat,
  onNavigateToMetas,
  onNavigateToBudgets: _onNavigateToBudgets,
}: DashboardTabProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingData>({
    nombre: '', ingreso_mensual: 0, objetivo_ahorro: 0,
  });

  // ── ÚNICA FUENTE DE VERDAD ────────────────────────────────────────────────
  // Todo viene de useSimpleSupabase. Cuando se crea/modifica una cuenta
  // o transacción, refresh() actualiza todo simultáneamente.
  const {
    transactions: allTransactions,
    accounts: rawAccounts,
    goals,
    installments,
    createAccount,
    refresh,
  } = useSimpleSupabase();

  // Tipado explícito para el trabajo interno
  const accounts = rawAccounts as SimpleAcc[];

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const raw = localStorage.getItem(`ai_wallet_onboarding_${user.id}`);
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        setOnboarding({
          nombre:          d.nombre          || '',
          ingreso_mensual: Number(d.ingreso_mensual) || 0,
          objetivo_ahorro: Number(d.objetivo_ahorro) || 0,
        });
      } catch { /* JSON inválido */ }
    };
    load();
  }, []);

  // ── Fechas ─────────────────────────────────────────────────────────────────

  const hoy = useMemo(() => new Date(), []);
  const diaDelMes    = hoy.getDate();
  const diasEnElMes  = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = Math.max(1, diasEnElMes - diaDelMes);
  const pctMes       = Math.round((diaDelMes / diasEnElMes) * 100);

  const thisMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const nextDate  = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  // ── Transacciones del mes ──────────────────────────────────────────────────

  const txMes = useMemo(
    () => allTransactions.filter(t => (t.transaction_date || '').startsWith(selectedMonth)),
    [allTransactions, selectedMonth]
  );

  // ── Cálculos financieros ───────────────────────────────────────────────────

  const financials = useMemo(() => {
    // — Ingresos y gastos del mes —
    const totalIngresos = txMes
      .filter(t => t.type === 'ingreso')
      .reduce((s, t) => s + Number(t.amount), 0);

    const totalGastos = txMes
      .filter(t => t.type === 'gasto')
      .reduce((s, t) => s + Number(t.amount), 0);

    const neto = totalIngresos - totalGastos;

    // — Saldos de cuentas (fuente directa del hook) —
    const liquidBalance = accounts
      .filter(a => (a.type === 'liquid' || a.type === 'savings'))
      .reduce((s, a) => s + Number(a.balance), 0);

    const creditDebt = accounts
      .filter(a => a.type === 'credit')
      .reduce((s, a) => s + Number(a.balance), 0);

    // Disponible real: lo que físicamente tenés menos lo que debés en tarjetas
    const realDisponible = liquidBalance - creditDebt;

    // — Cuotas —
    const cuotasEsteMes = installments
      .filter(i => i.due_month === thisMonth && !i.is_paid)
      .reduce((s, i) => s + Number(i.amount), 0);

    const cuotasProxMes = installments
      .filter(i => i.due_month === nextMonth && !i.is_paid)
      .reduce((s, i) => s + Number(i.amount), 0);

    // — Ingreso de referencia —
    // Prioridad: 1) ingresos registrados, 2) onboarding
    const ingresoRef = totalIngresos > 0 ? totalIngresos : onboarding.ingreso_mensual;

    // — Disponible para gastar por día —
    // Si tiene cuentas: usar realDisponible como base
    // Si no tiene cuentas: usar neto del mes
    const baseParaGastar = accounts.length > 0
      ? Math.max(0, realDisponible - onboarding.objetivo_ahorro - cuotasEsteMes)
      : Math.max(0, ingresoRef - onboarding.objetivo_ahorro - totalGastos - cuotasEsteMes);

    const gastoDiario = diasRestantes > 0 ? Math.round(baseParaGastar / diasRestantes) : 0;

    // — Proyección fin de mes —
    const gastoPromedioDiario = diaDelMes > 0 ? totalGastos / diaDelMes : 0;
    const gastoProyectado     = gastoPromedioDiario * diasEnElMes;
    const superavitProyectado = ingresoRef > 0
      ? ingresoRef - gastoProyectado
      : realDisponible - gastoProyectado; // fallback si no hay ingreso registrado
    const vaALlegar = superavitProyectado >= 0;

    // — Ritmo de gasto —
    const gastoDiarioIdeal = ingresoRef > 0
      ? (ingresoRef - onboarding.objetivo_ahorro) / diasEnElMes
      : 0;
    const ratioRitmo = gastoDiarioIdeal > 0 ? gastoPromedioDiario / gastoDiarioIdeal : 0;

    // — Top categoría del mes —
    const catGastos: Record<string, number> = {};
    txMes.filter(t => t.type === 'gasto').forEach(t => {
      const cat = t.category || 'otros';
      catGastos[cat] = (catGastos[cat] || 0) + Number(t.amount);
    });
    const topCat = Object.entries(catGastos).sort((a, b) => b[1] - a[1])[0];

    return {
      totalIngresos, totalGastos, neto,
      liquidBalance, creditDebt, realDisponible,
      cuotasEsteMes, cuotasProxMes,
      ingresoRef, gastoDiario,
      vaALlegar, superavitProyectado,
      ratioRitmo, topCat,
    };
  }, [
    txMes, accounts, installments,
    onboarding.ingreso_mensual, onboarding.objetivo_ahorro,
    diasRestantes, diasEnElMes, diaDelMes, thisMonth, nextMonth,
  ]);

  const {
    totalIngresos, totalGastos, neto,
    liquidBalance, creditDebt, realDisponible,
    cuotasEsteMes, cuotasProxMes,
    gastoDiario, vaALlegar, superavitProyectado,
    ingresoRef, ratioRitmo, topCat,
  } = financials;

  // ── Estado visual ──────────────────────────────────────────────────────────
  // Regla clara de prioridad:
  //   1. sin_datos    → no hay cuentas NI transacciones NI ingreso configurado
  //   2. con cuentas  → siempre mostrar realDisponible (aunque no haya tx)
  //   3. sin cuentas  → usar neto del mes o estimación por onboarding

  const estado = useMemo((): Estado => {
    const tieneCuentas    = accounts.length > 0;
    const tieneTx         = allTransactions.length > 0;
    const tieneIngreso    = ingresoRef > 0;

    // Sin nada configurado
    if (!tieneCuentas && !tieneTx && !tieneIngreso) return 'sin_datos';

    // Tiene cuentas → siempre mostrar disponible real
    if (tieneCuentas) {
      const ratio = liquidBalance > 0 ? realDisponible / liquidBalance : 0;
      if (realDisponible < 0)   return 'mal';
      if (ratio >= 0.20)        return 'bien';
      if (ratio >= 0.05)        return 'cuidado';
      return 'mal';
    }

    // Sin cuentas pero sin ingreso → pedir ingreso
    if (!tieneIngreso) return 'sin_ingreso';

    // Sin cuentas, con ingreso → estimación basada en transacciones
    if (txMes.length < 3) return 'estimacion';

    const ratio = ingresoRef > 0 ? neto / ingresoRef : 0;
    if (ratio >= 0.20) return 'bien';
    if (ratio >= 0.05) return 'cuidado';
    return 'mal';
  }, [accounts.length, allTransactions.length, ingresoRef, liquidBalance, realDisponible, txMes.length, neto]);

  const cfg = ESTADO_CFG[estado];

  // El número hero:
  //   - con cuentas → siempre realDisponible (efectivo − deuda tarjetas)
  //   - sin cuentas → neto del mes (ingresos − gastos)
  const heroAmount     = accounts.length > 0 ? realDisponible : neto;
  const showHeroNumber = estado !== 'sin_datos' && estado !== 'sin_ingreso';

  // ── Alertas ────────────────────────────────────────────────────────────────

  const alertas = useMemo(() => {
    const items: Array<{ icon: React.ReactNode; text: string; color: string; onClick?: () => void }> = [];

    if (cuotasEsteMes > 0 && heroAmount < cuotasEsteMes) {
      items.push({
        icon: <CreditCard size={13} />,
        text: `Tenés ${fmt(cuotasEsteMes)} en cuotas este mes y no alcanza el saldo`,
        color: '#FF5252', onClick: onNavigateToChat,
      });
    }
    if (ratioRitmo > 1.3 && ingresoRef > 0) {
      items.push({
        icon: <Zap size={13} />,
        text: `Gastás ${Math.round((ratioRitmo - 1) * 100)}% más rápido que lo ideal para llegar a fin de mes`,
        color: '#FFD740', onClick: onNavigateToChat,
      });
    }

    return items.slice(0, 3);
  }, [cuotasEsteMes, heroAmount, ratioRitmo, ingresoRef, onNavigateToChat]);

  // ── Metas y recientes ──────────────────────────────────────────────────────

  const metasActivas = useMemo(
    () => goals.filter(g => g.current_amount < g.target_amount).slice(0, 3),
    [goals]
  );

  const recientes = useMemo(
    () => [...allTransactions]
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 4),
    [allTransactions]
  );

  const liquidAccounts  = accounts.filter(a => a.type === 'liquid' || a.type === 'savings');
  const creditAccounts  = accounts.filter(a => a.type === 'credit');
  const totalCreditDebt = creditAccounts.reduce((s, a) => s + Number(a.balance), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 pb-24 md:pb-6"
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease' }}>

      {/* ── HERO ── */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: '#0D1410',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: cfg.glow !== 'transparent' ? `0 0 40px ${cfg.glow}` : 'none',
        }}>

        <div className="flex items-center justify-between mb-4">
          <p className="text-white/30 text-xs">
            {onboarding.nombre ? `Hola, ${onboarding.nombre}` : 'Tu resumen'}
            {' · '}{MESES[hoy.getMonth()]}
          </p>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.badgeClass}`}>
            {cfg.badge}
          </span>
        </div>

        {/* Número hero */}
        {!showHeroNumber ? (
          <button onClick={onNavigateToChat} className="w-full text-left mb-4">
            <p className="text-white/25 text-xs mb-2">{cfg.heroLabel}</p>
            <div className="rounded-xl px-4 py-3.5 border border-white/8 bg-white/4 flex items-center gap-3 hover:bg-white/6 active:scale-[.98] transition-all group">
              <span className="text-xl">🏦</span>
              <div className="flex-1 min-w-0">
                <p className="text-white/70 text-sm font-medium">
                  Configurá tus cuentas para ver tu disponible real
                </p>
                <p className="text-white/30 text-xs mt-0.5">
                  {estado === 'sin_ingreso'
                    ? 'Decile al coach cuánto ganás →'
                    : 'Hablá con el coach para empezar →'}
                </p>
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
            </div>
          </button>
        ) : (
          <div className="mb-4">
            <p className="text-white/30 text-xs mb-1">{cfg.heroLabel}</p>
            <p className="text-[52px] font-bold tracking-tight tabular-nums leading-none"
              style={{ color: cfg.color }}>
              {heroAmount < 0 ? '-' : ''}{fmtCompact(heroAmount)}
            </p>

            {/* Desglose debajo del número principal */}
            {accounts.length > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-white/20 text-[11px]">
                  💵 {fmt(liquidBalance)} en cuentas
                </span>
                {creditDebt > 0 && (
                  <span className="text-[#FF5252]/50 text-[11px]">
                    − 💳 {fmt(creditDebt)} deuda
                  </span>
                )}
              </div>
            )}

            {onboarding.objetivo_ahorro > 0 && (
              <p className="text-white/20 text-xs mt-1">
                Ahorrando {fmt(onboarding.objetivo_ahorro)}/mes
              </p>
            )}
          </div>
        )}

        {/* Proyección */}
        {showHeroNumber && (
          <div className="rounded-xl px-3 py-2.5 mb-4"
            style={{
              background: vaALlegar ? 'rgba(0,230,118,0.06)' : 'rgba(255,82,82,0.06)',
              border: vaALlegar ? '1px solid rgba(0,230,118,0.12)' : '1px solid rgba(255,82,82,0.12)',
            }}>
            <div className="flex items-center gap-2">
              {vaALlegar
                ? <TrendingUp  size={12} className="text-green-400 shrink-0" />
                : <TrendingDown size={12} className="text-red-400 shrink-0" />}
              <p className="text-xs" style={{ color: vaALlegar ? '#4ADE80' : '#F87171' }}>
                {vaALlegar
                  ? `A este ritmo cerrás con ${fmtCompact(superavitProyectado)} de sobra`
                  : `A este ritmo te faltan ${fmtCompact(Math.abs(superavitProyectado))} para llegar`}
              </p>
            </div>
            {topCat && (
              <p className="text-[10px] text-white/25 mt-1 ml-[20px]">
                Mayor gasto: {topCat[0]} ({fmtCompact(topCat[1])})
              </p>
            )}
          </div>
        )}

        {/* Barra de progreso del mes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/20 text-[10px]">{pctMes}% del mes</span>
            <span className="text-white/20 text-[10px]">{diasRestantes} días restantes</span>
          </div>
          <div className="h-px bg-white/6 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pctMes}%`, backgroundColor: cfg.color, opacity: 0.5 }} />
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="flex gap-2">
          <button onClick={onNavigateToChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 active:scale-[.97] transition-all text-white/55 text-xs font-medium">
            ✏️ Registrar gasto
          </button>
          {gastoDiario > 0 && (
            <div className="flex-1 flex items-center justify-center py-2.5 rounded-xl border text-xs font-medium"
              style={{ background: `${cfg.color}0D`, borderColor: `${cfg.color}20`, color: `${cfg.color}99` }}>
              {fmt(gastoDiario)}/día
            </div>
          )}
        </div>
      </div>

      {/* ── ALERTAS ── */}
      {alertas.length > 0 && (
        <div className="space-y-1.5">
          {alertas.map((a, i) => (
            <AlertPill key={i} icon={a.icon} text={a.text} color={a.color} onClick={a.onClick} />
          ))}
        </div>
      )}

      {/* ── MÉTRICAS ── */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { label: 'Ingresos', value: totalIngresos, color: '#69F0AE', sign: '+' },
          { label: 'Gastos',   value: totalGastos,   color: '#FF5252', sign: '-' },
          { label: 'Neto',     value: Math.abs(neto), color: neto >= 0 ? '#69F0AE' : '#FF5252', sign: neto < 0 ? '-' : '' },
        ] as const).map(item => (
          <div key={item.label} className="rounded-xl p-3 text-center"
            style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-white/25 text-[10px] mb-1">{item.label}</p>
            <p className="font-bold text-sm tabular-nums" style={{ color: item.color }}>
              {item.sign}{fmtCompact(item.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ── CUENTAS ── */}
      {accounts.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>

          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Mis cuentas</p>
            <button onClick={() => setShowAccountModal(true)}
              className="text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors flex items-center gap-1">
              + Nueva <ChevronRight size={11} />
            </button>
          </div>

          {/* Liquid/Savings */}
          {liquidAccounts.length > 0 && (
            <div className="flex gap-2 px-4 overflow-x-auto pb-3 scrollbar-hide">
              {liquidAccounts.map(acc => (
                <div key={acc.id}
                  className="flex-shrink-0 rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-[140px]"
                  style={{
                    background: acc.color ? `${acc.color}10` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${acc.color ? `${acc.color}20` : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  {accountIcon(acc.type)}
                  <div className="min-w-0">
                    <p className="text-white/45 text-[10px] truncate">{acc.name}</p>
                    <p className="text-white/80 text-sm font-bold tabular-nums">
                      {fmt(acc.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tarjetas de crédito */}
          {creditAccounts.length > 0 && (
            <div className="mx-4 mb-3 space-y-1.5">
              {creditDebt > 0 && (
                <p className="text-[#FF5252]/50 text-xs">
                  💳 Deuda en tarjetas: {fmt(totalCreditDebt)}
                </p>
              )}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {creditAccounts.map(acc => (
                  <div key={acc.id}
                    className="flex-shrink-0 rounded-xl px-3 py-2 flex items-center gap-2 min-w-[140px]"
                    style={{ background: 'rgba(255,82,82,0.05)', border: '1px solid rgba(255,82,82,0.12)' }}>
                    <CreditCard size={12} className="text-[#FF5252]/40 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white/40 text-[10px] truncate">{acc.name}</p>
                      <p className="text-[#FF5252]/70 text-sm font-bold tabular-nums">
                        {fmt(acc.balance)} deuda
                      </p>
                      {acc.credit_limit && acc.credit_limit > 0 && (
                        <p className="text-white/20 text-[10px]">
                          Límite {fmt(acc.credit_limit)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disponible real */}
          <div className="mx-4 mb-4 mt-1 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-white/30 text-[10px] mb-0.5">Disponible real</p>
            <p className="text-white/20 text-[9px] mb-1">
              {creditDebt > 0
                ? `${fmt(liquidBalance)} en cuentas − ${fmt(creditDebt)} en tarjetas`
                : 'Suma de todas tus cuentas'}
            </p>
            <p className="text-lg font-bold tabular-nums"
              style={{ color: realDisponible >= 0 ? '#00C853' : '#FF5252' }}>
              {realDisponible < 0 ? '-' : ''}{fmt(realDisponible)}
            </p>
          </div>
        </div>
      )}

      {/* ── CUOTAS ── */}
      <CuotasCard esteMes={cuotasEsteMes} proxMes={cuotasProxMes} onChat={onNavigateToChat} />

      {/* ── METAS ── */}
      {metasActivas.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Metas</p>
            <button onClick={onNavigateToMetas}
              className="flex items-center gap-1 text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors">
              Ver todas <ChevronRight size={11} />
            </button>
          </div>
          {metasActivas.map(meta => {
            const pct = (meta.current_amount / meta.target_amount) * 100;
            const diasRestantesMeta = meta.target_date
              ? Math.ceil((new Date(meta.target_date).getTime() - Date.now()) / 86_400_000)
              : undefined;
            return (
              <GoalRow
                key={meta.id}
                icono={meta.icon}
                titulo={meta.name}
                pct={pct}
                diasRestantes={diasRestantesMeta !== undefined && diasRestantesMeta <= 60 ? diasRestantesMeta : undefined}
              />
            );
          })}
        </div>
      )}

      {/* ── ACTIVIDAD RECIENTE ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Actividad reciente</p>
          {recientes.length > 0 && (
            <button onClick={onNavigateToChat}
              className="flex items-center gap-1 text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors">
              Ver todo <ChevronRight size={11} />
            </button>
          )}
        </div>

        {recientes.length === 0 ? (
          <button onClick={onNavigateToChat}
            className="w-full flex items-center gap-3 px-4 pb-4 text-left group">
            <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0">✏️</div>
            <div className="flex-1 min-w-0">
              <p className="text-white/55 text-sm">Registrá tu primer gasto</p>
              <p className="text-white/25 text-xs">Hablá con el coach →</p>
            </div>
            <ArrowRight size={14} className="text-white/15 shrink-0" />
          </button>
        ) : (
          <div className="pb-2">
            {recientes.map((t, idx) => (
              <div key={t.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${idx < recientes.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                <div className="w-8 h-8 bg-white/4 rounded-xl flex items-center justify-center text-sm shrink-0">
                  {getEmoji(t.category || 'otros')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/65 text-sm truncate">{t.description}</p>
                  <p className="text-white/25 text-[10px]">{fechaRel(t.transaction_date)}</p>
                </div>
                <p className="text-sm font-medium tabular-nums shrink-0"
                  style={{ color: t.type === 'ingreso' ? '#69F0AE' : 'rgba(255,255,255,0.4)' }}>
                  {t.type === 'ingreso' ? '+' : '-'}{fmtCompact(Number(t.amount))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ESTADO VACÍO ── */}
      {allTransactions.length === 0 && accounts.length === 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-4">Empecemos</p>
          <div className="space-y-1">
            {([
              { icon: '💬', title: 'Registrá tu primer gasto',   desc: 'Hablá con el coach — es más rápido de lo que parece', action: onNavigateToChat },
              { icon: '🎯', title: 'Creá tu primera meta',        desc: 'Decile al coach para qué estás ahorrando',           action: onNavigateToMetas },
            ] as const).map((item, idx) => (
              <button key={idx} onClick={item.action}
                className="w-full flex items-center gap-3 text-left p-2.5 rounded-xl hover:bg-white/4 active:bg-white/6 transition-colors group">
                <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/65 text-sm font-medium">{item.title}</p>
                  <p className="text-white/28 text-xs">{item.desc}</p>
                </div>
                <ArrowRight size={13} className="text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL NUEVA CUENTA ── */}
      {showAccountModal && (
        <AccountModal
          isFirstAccount={accounts.length === 0}
          createAccount={createAccount}
          onClose={() => setShowAccountModal(false)}
          onSuccess={() => { setShowAccountModal(false); refresh(); }}
        />
      )}
    </div>
  );
}
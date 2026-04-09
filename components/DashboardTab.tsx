'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ArrowRight, TrendingUp, TrendingDown, CreditCard, Landmark, PiggyBank, Zap, AlertTriangle, Target } from 'lucide-react';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import AccountModal from './AccountModal';
import { supabase } from '../lib/supabase';
import type { Account } from '../lib/types';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface DashboardTabProps {
  selectedMonth: string;
  onNavigateToChat: () => void;
  onNavigateToMetas: () => void;
  onNavigateToBudgets?: () => void;
  accounts: Account[];
}

interface OnboardingData {
  nombre: string;
  ingreso_mensual: number;
  objetivo_ahorro: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}k`;
  return `$${Math.round(abs).toLocaleString('es-AR')}`;
};

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const EMOJI_CAT: Record<string, string> = {
  alimentacion: '🍔', comida: '🍔', supermercado: '🛒', super: '🛒',
  transporte: '🚌', nafta: '⛽', salidas: '🎉', entretenimiento: '🎬',
  sueldo: '💼', salario: '💼', ahorro: '💰', servicios: '💡',
  suscripciones: '📱', salud: '💊', farmacia: '💊', ropa: '👕',
  mascotas: '🐕', gym: '💪', educacion: '📚', viaje: '✈️', otros: '📦',
};

const getEmoji = (cat: string): string => {
  const key = Object.keys(EMOJI_CAT).find(k => cat.toLowerCase().includes(k));
  return key ? EMOJI_CAT[key] : '📦';
};

const fechaRel = (d: string): string => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff}d`;
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const accountIcon = (type: Account['type']) => {
  if (type === 'credit') return <CreditCard size={13} className="text-white/30 shrink-0" />;
  if (type === 'savings') return <PiggyBank size={13} className="text-white/30 shrink-0" />;
  return <Landmark size={13} className="text-white/30 shrink-0" />;
};

// ─── Tipos de estado ────────────────────────────────────────────────────────

type Estado = 'sin_datos' | 'sin_ingreso' | 'estimacion' | 'bien' | 'cuidado' | 'mal';

interface EstadoCfg {
  color: string;
  glow: string;
  badge: string;
  badgeClass: string;
  msg: string;
  heroLabel: string;
}

const ESTADO_CFG: Record<Estado, EstadoCfg> = {
  sin_datos: {
    color: 'rgba(255,255,255,0.2)',
    glow: 'transparent',
    badge: 'Empecemos',
    badgeClass: 'text-white/40 bg-white/5 border-white/10',
    msg: 'Registrá ingresos y gastos para ver tu situación real.',
    heroLabel: 'Configurando...',
  },
  sin_ingreso: {
    color: 'rgba(255,255,255,0.3)',
    glow: 'transparent',
    badge: 'Falta ingreso',
    badgeClass: 'text-white/50 bg-white/6 border-white/12',
    msg: 'Registrá tu ingreso mensual para calcular cuánto podés gastar.',
    heroLabel: '¿Cuánto ganás?',
  },
  estimacion: {
    color: '#69F0AE',
    glow: 'rgba(105,240,174,0.12)',
    badge: 'Estimación',
    badgeClass: 'text-[#69F0AE]/70 bg-[#00C853]/10 border-[#00C853]/20',
    msg: 'Con más datos la estimación mejora.',
    heroLabel: 'Disponible estimado hoy',
  },
  bien: {
    color: '#00E676',
    glow: 'rgba(0,230,118,0.10)',
    badge: 'Vas bien',
    badgeClass: 'text-[#00E676] bg-[#00E676]/10 border-[#00E676]/25',
    msg: 'Seguí el ritmo hasta fin de mes.',
    heroLabel: 'Podés gastar hoy',
  },
  cuidado: {
    color: '#FFD740',
    glow: 'rgba(255,215,64,0.10)',
    badge: 'Cuidado',
    badgeClass: 'text-[#FFD740] bg-[#FFD740]/10 border-[#FFD740]/20',
    msg: 'Poco margen. Pensalo antes de gastar.',
    heroLabel: 'Podés gastar hoy',
  },
  mal: {
    color: '#FF5252',
    glow: 'rgba(255,82,82,0.10)',
    badge: 'Estás justo',
    badgeClass: 'text-[#FF5252] bg-[#FF5252]/10 border-[#FF5252]/20',
    msg: 'Revisá tus gastos. Algo no cierra.',
    heroLabel: 'Disponible',
  },
};

// ─── Subcomponente: Pill de alerta ──────────────────────────────────────────

function AlertPill({ icon, text, color, onClick }: {
  icon: React.ReactNode;
  text: string;
  color: string;
  onClick?: () => void;
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

// ─── Subcomponente: Fila de meta ────────────────────────────────────────────

function GoalRow({ icono, titulo, pct, diasRestantes }: {
  icono: string;
  titulo: string;
  pct: number;
  diasRestantes?: number;
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
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-[11px] tabular-nums w-8 text-right" style={{ color: `${color}99` }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

// ─── Subcomponente: Cuotas próximas ─────────────────────────────────────────

function CuotasCard({ esteMes, proxMes, onChat }: {
  esteMes: number;
  proxMes: number;
  onChat: () => void;
}) {
  if (esteMes === 0 && proxMes === 0) return null;
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
          Cuotas pendientes
        </p>
        <CreditCard size={12} className="text-white/20" />
      </div>
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        {/* Este mes */}
        <div
          className="rounded-xl px-3 py-2.5"
          style={{
            background: esteMes > 0 ? 'rgba(255,82,82,0.06)' : 'rgba(255,255,255,0.03)',
            border: esteMes > 0 ? '1px solid rgba(255,82,82,0.15)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p className="text-white/30 text-[10px] mb-1">Este mes</p>
          <p
            className="text-base font-bold tabular-nums"
            style={{ color: esteMes > 0 ? '#FF5252' : 'rgba(255,255,255,0.2)' }}
          >
            {esteMes > 0 ? fmt(esteMes) : '—'}
          </p>
          {esteMes > 0 && (
            <p className="text-[10px] text-white/25 mt-0.5">comprometido</p>
          )}
        </div>
        {/* Próximo mes */}
        <div
          className="rounded-xl px-3 py-2.5"
          style={{
            background: proxMes > 0 ? 'rgba(255,215,64,0.05)' : 'rgba(255,255,255,0.03)',
            border: proxMes > 0 ? '1px solid rgba(255,215,64,0.12)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p className="text-white/30 text-[10px] mb-1">Próximo mes</p>
          <p
            className="text-base font-bold tabular-nums"
            style={{ color: proxMes > 0 ? '#FFD740' : 'rgba(255,255,255,0.2)' }}
          >
            {proxMes > 0 ? fmt(proxMes) : '—'}
          </p>
          {proxMes > 0 && (
            <p className="text-[10px] text-white/25 mt-0.5">se viene</p>
          )}
        </div>
      </div>
      {esteMes > 0 && (
        <button
          onClick={onChat}
          className="w-full text-center py-2.5 border-t border-white/[0.04] text-[11px] text-white/30 hover:text-white/50 transition-colors"
        >
          Ver detalle de cuotas →
        </button>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function DashboardTab({
  selectedMonth,
  onNavigateToChat,
  onNavigateToMetas,
  onNavigateToBudgets,
  accounts,
}: DashboardTabProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingData>({
    nombre: '',
    ingreso_mensual: 0,
    objetivo_ahorro: 0,
  });

  const { transactions, goals, budgets, installments, createAccount, refresh } =
    useSimpleAdaptedData(selectedMonth);

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
          nombre: d.nombre || '',
          ingreso_mensual: Number(d.ingreso_mensual) || 0,
          objetivo_ahorro: Number(d.objetivo_ahorro) || 0,
        });
      } catch { /* JSON inválido */ }
    };
    load();
  }, []);

  // ── Fechas ────────────────────────────────────────────────────────────────

  const hoy = useMemo(() => new Date(), []);
  const diaDelMes = hoy.getDate();
  const diasEnElMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = diasEnElMes - diaDelMes;
  const pctMes = Math.round((diaDelMes / diasEnElMes) * 100);

  const thisMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const nextDate = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  // ── Cálculos ──────────────────────────────────────────────────────────────

  const financials = useMemo(() => {
    const totalIngresos = transactions
      .filter(t => t.tipo === 'ingreso')
      .reduce((s, t) => s + Number(t.monto), 0);
    const totalGastos = transactions
      .filter(t => t.tipo === 'gasto')
      .reduce((s, t) => s + Math.abs(Number(t.monto)), 0);
    const neto = totalIngresos - totalGastos;

    const liquidTotal = accounts
      .filter(a => (a.type === 'liquid' || a.type === 'savings') && a.is_active)
      .reduce((s, a) => s + a.balance, 0);
    const creditDebt = accounts
      .filter(a => a.type === 'credit' && a.is_active)
      .reduce((s, a) => s + a.balance, 0);
    const realDisponible = liquidTotal - creditDebt;

    const cuotasEsteMes = installments
      .filter(i => i.due_month === thisMonth && !i.is_paid)
      .reduce((s, i) => s + i.amount, 0);
    const cuotasProxMes = installments
      .filter(i => i.due_month === nextMonth && !i.is_paid)
      .reduce((s, i) => s + i.amount, 0);

    const ingresoRef = totalIngresos > 0 ? totalIngresos : onboarding.ingreso_mensual;

    const baseParaGastar = accounts.length > 0
      ? Math.max(0, realDisponible - onboarding.objetivo_ahorro - cuotasEsteMes)
      : Math.max(0, (ingresoRef - onboarding.objetivo_ahorro) - totalGastos - cuotasEsteMes);
    const gastoDiario = diasRestantes > 0 ? Math.round(baseParaGastar / diasRestantes) : 0;

    const gastoPromedioDiario = diaDelMes > 0 ? totalGastos / diaDelMes : 0;
    const gastoProyectado = gastoPromedioDiario * diasEnElMes;
    const superavitProyectado = ingresoRef - gastoProyectado;
    const vaALlegar = superavitProyectado >= 0;

    // Ritmo de gasto: comparar promedio diario actual vs ideal
    const gastoDiarioIdeal = ingresoRef > 0 ? (ingresoRef - onboarding.objetivo_ahorro) / diasEnElMes : 0;
    const ratioRitmo = gastoDiarioIdeal > 0 ? gastoPromedioDiario / gastoDiarioIdeal : 0;

    // Categoría con más gasto este mes
    const catGastos: Record<string, number> = {};
    transactions
      .filter(t => t.tipo === 'gasto')
      .forEach(t => {
        const cat = t.categoria?.id || 'otros';
        catGastos[cat] = (catGastos[cat] || 0) + Math.abs(Number(t.monto));
      });
    const topCat = Object.entries(catGastos).sort((a, b) => b[1] - a[1])[0];

    return {
      totalIngresos, totalGastos, neto,
      liquidTotal, creditDebt, realDisponible,
      cuotasEsteMes, cuotasProxMes,
      ingresoRef, gastoDiario,
      vaALlegar, superavitProyectado,
      ratioRitmo, topCat,
    };
  }, [
    transactions, accounts, installments,
    onboarding.ingreso_mensual, onboarding.objetivo_ahorro,
    diasRestantes, diasEnElMes, diaDelMes, thisMonth, nextMonth,
  ]);

  const {
    totalIngresos, totalGastos, neto,
    realDisponible, cuotasEsteMes, cuotasProxMes,
    gastoDiario, vaALlegar, superavitProyectado,
    ingresoRef, ratioRitmo, topCat,
  } = financials;

  // ── Estado ────────────────────────────────────────────────────────────────

  const estado = useMemo((): Estado => {
    const sinDatos = totalIngresos === 0 && totalGastos === 0 && accounts.length === 0;
    if (sinDatos) return 'sin_datos';
    if (ingresoRef === 0 && accounts.length === 0) return 'sin_ingreso';
    if (transactions.length < 3 && totalIngresos > 0) return 'estimacion';
    const base = accounts.length > 0 ? realDisponible : neto;
    const ratio = ingresoRef > 0 ? base / ingresoRef : 0;
    if (ratio >= 0.20) return 'bien';
    if (ratio >= 0.05) return 'cuidado';
    return 'mal';
  }, [totalIngresos, totalGastos, accounts.length, transactions.length, ingresoRef, realDisponible, neto]);

  const cfg = ESTADO_CFG[estado];
  const heroAmount = accounts.length > 0 ? realDisponible : neto;
  const showHeroNumber = estado !== 'sin_datos' && estado !== 'sin_ingreso';

  // ── Alertas inteligentes ──────────────────────────────────────────────────

  const alertas = useMemo(() => {
    const items: Array<{ icon: React.ReactNode; text: string; color: string; onClick?: () => void }> = [];

    // 1. Cuotas este mes sin cubrir
    if (cuotasEsteMes > 0 && heroAmount < cuotasEsteMes) {
      items.push({
        icon: <CreditCard size={13} />,
        text: `Tenés ${fmt(cuotasEsteMes)} en cuotas este mes y no alcanza el saldo`,
        color: '#FF5252',
        onClick: onNavigateToChat,
      });
    }

    // 2. Ritmo de gasto acelerado
    if (ratioRitmo > 1.3 && ingresoRef > 0) {
      items.push({
        icon: <Zap size={13} />,
        text: `Gastás ${Math.round((ratioRitmo - 1) * 100)}% más rápido que lo ideal para llegar a fin de mes`,
        color: '#FFD740',
        onClick: onNavigateToChat,
      });
    }

    // 3. Budgets excedidos o casi
    budgets
      .filter(b => b.limite > 0)
      .map(b => ({ b, pct: (b.gastado / b.limite) * 100, rem: b.limite - b.gastado }))
      .filter(({ pct }) => pct >= 85)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .forEach(({ b, pct, rem }) => {
        if (pct >= 100) {
          items.push({
            icon: <AlertTriangle size={13} />,
            text: `${b.categoriaId} superó el límite en ${fmt(Math.abs(rem))}`,
            color: '#FF5252',
            onClick: onNavigateToBudgets,
          });
        } else {
          items.push({
            icon: <AlertTriangle size={13} />,
            text: `${b.categoriaId} al ${Math.round(pct)}% — quedan ${fmt(rem)}`,
            color: '#FFD740',
            onClick: onNavigateToBudgets,
          });
        }
      });

    // 4. Metas en riesgo
    if (items.length < 3) {
      goals
        .filter(g => g.fechaLimite && g.montoActual < g.montoObjetivo)
        .map(g => ({
          g,
          dias: Math.ceil((new Date(g.fechaLimite!).getTime() - Date.now()) / 86_400_000),
          pct: (g.montoActual / g.montoObjetivo) * 100,
        }))
        .filter(({ dias, pct }) => dias <= 30 && pct < 80)
        .slice(0, 3 - items.length)
        .forEach(({ g, dias, pct }) => {
          items.push({
            icon: <Target size={13} />,
            text: `${g.titulo} vence en ${dias}d y va al ${Math.round(pct)}%`,
            color: '#FF9800',
            onClick: onNavigateToMetas,
          });
        });
    }

    return items.slice(0, 3);
  }, [budgets, goals, cuotasEsteMes, heroAmount, ratioRitmo, ingresoRef, onNavigateToChat, onNavigateToBudgets, onNavigateToMetas]);

  // ── Metas y recientes ─────────────────────────────────────────────────────

  const metasActivas = useMemo(
    () => goals.filter(g => g.montoActual < g.montoObjetivo).slice(0, 3),
    [goals],
  );

  const recientes = useMemo(
    () => [...transactions]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 4),
    [transactions],
  );

  const liquidAccounts = useMemo(
    () => accounts.filter(a => (a.type === 'liquid' || a.type === 'savings') && a.is_active),
    [accounts],
  );
  const creditAccounts = useMemo(
    () => accounts.filter(a => a.type === 'credit' && a.is_active),
    [accounts],
  );
  const totalCredit = creditAccounts.reduce((s, a) => s + a.balance, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="space-y-3 pb-24 md:pb-6"
      style={{
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >

      {/* ══════════════════════════════════
          HERO — número del día
      ══════════════════════════════════ */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: '#0D1410',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: cfg.glow !== 'transparent' ? `0 0 40px ${cfg.glow}` : 'none',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-white/30 text-xs">
            {onboarding.nombre ? `Hola, ${onboarding.nombre}` : 'Tu resumen'}
            {' · '}{MESES[hoy.getMonth()]}
          </p>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.badgeClass}`}>
            {cfg.badge}
          </span>
        </div>

        {/* Número principal */}
        {!showHeroNumber ? (
          <button onClick={onNavigateToChat} className="w-full text-left mb-4">
            <p className="text-white/25 text-xs mb-2">{cfg.heroLabel}</p>
            <div className="rounded-xl px-4 py-3.5 border border-white/8 bg-white/4 flex items-center gap-3 hover:bg-white/6 active:scale-[.98] transition-all group">
              <span className="text-xl">🏦</span>
              <div className="flex-1 min-w-0">
                <p className="text-white/70 text-sm font-medium">Configurá tus cuentas para ver tu disponible real</p>
                <p className="text-white/30 text-xs mt-0.5">
                  {estado === 'sin_ingreso' ? 'Decile al coach cuánto ganás →' : 'Hablá con el coach para empezar →'}
                </p>
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
            </div>
          </button>
        ) : (
          <div className="mb-4">
            <p className="text-white/30 text-xs mb-1">{cfg.heroLabel}</p>
            <p
              className="text-[52px] font-bold tracking-tight tabular-nums leading-none"
              style={{ color: cfg.color }}
            >
              {heroAmount < 0 ? '-' : ''}{fmtCompact(heroAmount)}
            </p>
            {onboarding.objetivo_ahorro > 0 && (
              <p className="text-white/25 text-xs mt-2">
                Ahorrando {fmt(onboarding.objetivo_ahorro)}/mes
              </p>
            )}
          </div>
        )}

        {/* Insight instantáneo — la línea más útil del dashboard */}
        {showHeroNumber && (
          <div
            className="rounded-xl px-3 py-2.5 mb-4"
            style={{
              background: vaALlegar ? 'rgba(0,230,118,0.06)' : 'rgba(255,82,82,0.06)',
              border: vaALlegar ? '1px solid rgba(0,230,118,0.12)' : '1px solid rgba(255,82,82,0.12)',
            }}
          >
            <div className="flex items-center gap-2">
              {vaALlegar
                ? <TrendingUp size={12} className="text-green-400 shrink-0" />
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

        {/* Barra de mes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/20 text-[10px]">{pctMes}% del mes</span>
            <span className="text-white/20 text-[10px]">{diasRestantes} días restantes</span>
          </div>
          <div className="h-px bg-white/6 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pctMes}%`, backgroundColor: cfg.color, opacity: 0.5 }}
            />
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-2">
          <button
            onClick={onNavigateToChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 active:scale-[.97] transition-all text-white/55 text-xs font-medium"
          >
            ✏️ Registrar gasto
          </button>
          {gastoDiario > 0 && (
            <div className="flex-1 flex items-center justify-center py-2.5 rounded-xl border text-xs font-medium"
              style={{ background: `${cfg.color}0D`, borderColor: `${cfg.color}20`, color: `${cfg.color}99` }}
            >
              {fmt(gastoDiario)}/día
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════
          ALERTAS INTELIGENTES
          (solo si hay algo urgente — primero que el usuario lea)
      ══════════════════════════════════ */}
      {alertas.length > 0 && (
        <div className="space-y-1.5">
          {alertas.map((a, i) => (
            <AlertPill key={i} icon={a.icon} text={a.text} color={a.color} onClick={a.onClick} />
          ))}
        </div>
      )}

      {/* ══════════════════════════════════
          MÉTRICAS (3 cols)
      ══════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { label: 'Ingresos', value: totalIngresos, color: '#69F0AE', sign: '+' },
          { label: 'Gastos',   value: totalGastos,   color: '#FF5252', sign: '-' },
          { label: 'Neto',     value: Math.abs(neto), color: neto >= 0 ? '#69F0AE' : '#FF5252', sign: neto < 0 ? '-' : '' },
        ] as const).map(item => (
          <div
            key={item.label}
            className="rounded-xl p-3 text-center"
            style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="text-white/25 text-[10px] mb-1">{item.label}</p>
            <p className="font-bold text-sm tabular-nums" style={{ color: item.color }}>
              {item.sign}{fmtCompact(item.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════
          CUENTAS
      ══════════════════════════════════ */}
      {accounts.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Mis cuentas</p>
            <button
              onClick={() => setShowAccountModal(true)}
              className="text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors flex items-center gap-1"
            >
              + Nueva <ChevronRight size={11} />
            </button>
          </div>

          {liquidAccounts.length > 0 && (
            <div className="flex gap-2 px-4 overflow-x-auto pb-3 scrollbar-hide">
              {liquidAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="flex-shrink-0 rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-[130px]"
                  style={{
                    background: acc.color ? `${acc.color}10` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${acc.color ? `${acc.color}20` : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {accountIcon(acc.type)}
                  <div className="min-w-0">
                    <p className="text-white/45 text-[10px] truncate">{acc.name}</p>
                    <p className="text-white/80 text-sm font-bold tabular-nums">{fmt(acc.balance)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {creditAccounts.length > 0 && totalCredit > 0 && (
            <div className="mx-4 pt-3 border-t border-white/5">
              <p className="text-[#FF5252]/50 text-xs mb-2">
                💳 Comprometido en tarjetas: {fmt(totalCredit)}
              </p>
            </div>
          )}

          <div
            className="mx-4 mb-4 mt-1 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-white/30 text-[10px] mb-0.5">Disponible real</p>
            <p className="text-white/20 text-[9px] mb-1">Efectivo − deuda de tarjetas</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: realDisponible >= 0 ? '#00C853' : '#FF5252' }}>
              {realDisponible < 0 ? '-' : ''}{fmt(realDisponible)}
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          CUOTAS PENDIENTES
      ══════════════════════════════════ */}
      <CuotasCard
        esteMes={cuotasEsteMes}
        proxMes={cuotasProxMes}
        onChat={onNavigateToChat}
      />

      {/* ══════════════════════════════════
          METAS
      ══════════════════════════════════ */}
      {metasActivas.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Metas</p>
            <button
              onClick={onNavigateToMetas}
              className="flex items-center gap-1 text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors"
            >
              Ver todas <ChevronRight size={11} />
            </button>
          </div>
          {metasActivas.map(meta => {
            const diasRestantesMeta = meta.fechaLimite
              ? Math.ceil((new Date(meta.fechaLimite).getTime() - Date.now()) / 86_400_000)
              : undefined;
            return (
              <GoalRow
                key={meta.id}
                icono={meta.icono}
                titulo={meta.titulo}
                pct={(meta.montoActual / meta.montoObjetivo) * 100}
                diasRestantes={diasRestantesMeta !== undefined && diasRestantesMeta <= 60 ? diasRestantesMeta : undefined}
              />
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════
          ACTIVIDAD RECIENTE
      ══════════════════════════════════ */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">Actividad reciente</p>
          {recientes.length > 0 && (
            <button
              onClick={onNavigateToChat}
              className="flex items-center gap-1 text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors"
            >
              Ver todo <ChevronRight size={11} />
            </button>
          )}
        </div>

        {recientes.length === 0 ? (
          <button
            onClick={onNavigateToChat}
            className="w-full flex items-center gap-3 px-4 pb-4 text-left group"
          >
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
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${idx < recientes.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="w-8 h-8 bg-white/4 rounded-xl flex items-center justify-center text-sm shrink-0">
                  {getEmoji(t.categoria?.id || 'otros')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/65 text-sm truncate">{t.descripcion}</p>
                  <p className="text-white/25 text-[10px]">{fechaRel(t.fecha)}</p>
                </div>
                <p
                  className="text-sm font-medium tabular-nums shrink-0"
                  style={{ color: t.tipo === 'ingreso' ? '#69F0AE' : 'rgba(255,255,255,0.4)' }}
                >
                  {t.tipo === 'ingreso' ? '+' : '-'}{fmtCompact(Number(t.monto))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════
          ESTADO VACÍO
      ══════════════════════════════════ */}
      {transactions.length === 0 && accounts.length === 0 && (
        <div
          className="rounded-2xl p-5"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-4">Empecemos</p>
          <div className="space-y-1">
            {([
              { icon: '💬', title: 'Registrá tu primer gasto', desc: 'Hablá con el coach — es más rápido de lo que parece', action: onNavigateToChat },
              { icon: '🏦', title: 'Conectá tus cuentas', desc: 'Para ver tu dinero real en un solo lugar', action: () => setShowAccountModal(true) },
              { icon: '🎯', title: 'Creá tu primera meta', desc: 'Decile al coach para qué estás ahorrando', action: onNavigateToMetas },
            ] as const).map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="w-full flex items-center gap-3 text-left p-2.5 rounded-xl hover:bg-white/4 active:bg-white/6 transition-colors group"
              >
                <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0">
                  {item.icon}
                </div>
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

      {/* ══════════════════════════════════
          ACCOUNT MODAL
      ══════════════════════════════════ */}
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
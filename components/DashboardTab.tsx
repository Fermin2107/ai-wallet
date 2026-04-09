'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight, ArrowRight, TrendingUp, TrendingDown,
  CreditCard, Landmark, PiggyBank,
} from 'lucide-react';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import AccountModal from './AccountModal';
import { supabase } from '../lib/supabase';
import type { Account } from '../lib/types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const EMOJI_CATEGORIA: Record<string, string> = {
  alimentacion: '🍔', comida: '🍔', supermercado: '🛒', super: '🛒',
  transporte: '🚌', nafta: '⛽', salidas: '🎉', entretenimiento: '🎬',
  sueldo: '💼', salario: '💼', ahorro: '💰', servicios: '💡',
  suscripciones: '📱', salud: '💊', farmacia: '💊', ropa: '👕',
  mascotas: '🐕', gym: '💪', educacion: '📚', viaje: '✈️', otros: '📦',
};

const getEmojiCategoria = (cat: string): string => {
  const key = Object.keys(EMOJI_CATEGORIA).find(k => cat.toLowerCase().includes(k));
  return key ? EMOJI_CATEGORIA[key] : '📦';
};

const fechaRelativa = (d: string): string => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff} días`;
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const accountIcon = (type: Account['type']) => {
  if (type === 'credit') return <CreditCard size={14} className="text-white/30 shrink-0" />;
  if (type === 'savings') return <PiggyBank size={14} className="text-white/30 shrink-0" />;
  return <Landmark size={14} className="text-white/30 shrink-0" />;
};

// ─── Estado del héroe ─────────────────────────────────────────────────────────

type Estado = 'sin_datos' | 'sin_ingreso' | 'estimacion' | 'bien' | 'cuidado' | 'mal';

interface EstadoCfg {
  color: string;
  badge: string;
  badgeClass: string;
  msg: string;
  heroLabel: string;
}

const ESTADO_CFG: Record<Estado, EstadoCfg> = {
  sin_datos: {
    color: 'rgba(255,255,255,0.25)',
    badge: 'Empecemos',
    badgeClass: 'text-white/40 bg-white/5 border-white/10',
    msg: 'Registrá ingresos y gastos para ver tu situación real.',
    heroLabel: 'Configurando...',
  },
  sin_ingreso: {
    color: 'rgba(255,255,255,0.35)',
    badge: 'Falta ingreso',
    badgeClass: 'text-white/50 bg-white/6 border-white/12',
    msg: 'Registrá tu ingreso mensual para calcular cuánto podés gastar.',
    heroLabel: '¿Cuánto ganás?',
  },
  estimacion: {
    color: '#69F0AE',
    badge: 'Estimación inicial',
    badgeClass: 'text-[#69F0AE]/70 bg-[#00C853]/10 border-[#00C853]/20',
    msg: 'Con más datos la estimación mejora.',
    heroLabel: 'Podés gastar hoy (estimado)',
  },
  bien: {
    color: '#00C853',
    badge: 'Vas bien',
    badgeClass: 'text-[#00C853] bg-[#00C853]/12 border-[#00C853]/25',
    msg: 'Vas bien. Seguí el ritmo hasta fin de mes.',
    heroLabel: 'Podés gastar hoy',
  },
  cuidado: {
    color: '#FFD740',
    badge: 'Cuidado',
    badgeClass: 'text-[#FFD740] bg-[#FFD740]/10 border-[#FFD740]/20',
    msg: 'Poco margen. Pensalo antes de gastar.',
    heroLabel: 'Podés gastar hoy',
  },
  mal: {
    color: '#FF5252',
    badge: 'Estás justo',
    badgeClass: 'text-[#FF5252] bg-[#FF5252]/10 border-[#FF5252]/20',
    msg: 'Estás justo este mes. Revisá tus gastos.',
    heroLabel: 'Disponible',
  },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function UrgentItem({
  text, onClick,
}: { text: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/4 active:bg-white/6 transition-colors"
    >
      <span className="text-sm leading-snug text-white/70 flex-1">{text}</span>
      {onClick && <ChevronRight size={13} className="text-white/20 shrink-0" />}
    </button>
  );
}

function GoalRow({
  icono, titulo, pct,
}: { icono: string; titulo: string; pct: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
      <span className="text-base shrink-0">{icono}</span>
      <p className="text-white/70 text-sm truncate flex-1">{titulo}</p>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: pct >= 75 ? '#00C853' : pct >= 40 ? '#FFD740' : '#FF6D00',
            }}
          />
        </div>
        <span className="text-white/40 text-xs tabular-nums w-7 text-right">
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardTab({
  selectedMonth,
  onNavigateToChat,
  onNavigateToMetas,
  onNavigateToBudgets,
  accounts,
}: DashboardTabProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingData>({
    nombre: '',
    ingreso_mensual: 0,
    objetivo_ahorro: 0,
  });

  const { transactions, goals, budgets, installments, createAccount, refresh } =
    useSimpleAdaptedData(selectedMonth);

  // ── Cargar onboarding desde localStorage (solo en efecto, nunca en render) ──
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
      } catch {
        // JSON inválido: ignorar
      }
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

  // ── Cálculos memoizados ────────────────────────────────────────────────────
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

    // Ingresos de referencia
    const ingresoRef =
      totalIngresos > 0 ? totalIngresos : onboarding.ingreso_mensual;

    // Gasto diario sugerido
    const baseParaGastar = accounts.length > 0
      ? Math.max(0, realDisponible - onboarding.objetivo_ahorro)
      : Math.max(0, (ingresoRef - onboarding.objetivo_ahorro) - totalGastos);
    const gastoDiario = diasRestantes > 0 ? Math.round(baseParaGastar / diasRestantes) : 0;

    // Proyección fin de mes
    const gastoPromedioDiario = diaDelMes > 0 ? totalGastos / diaDelMes : 0;
    const gastoProyectado = gastoPromedioDiario * diasEnElMes;
    const superavitProyectado = ingresoRef - gastoProyectado;
    const vaALlegar = superavitProyectado >= 0;

    return {
      totalIngresos, totalGastos, neto,
      liquidTotal, creditDebt, realDisponible,
      cuotasEsteMes, cuotasProxMes,
      ingresoRef, gastoDiario,
      vaALlegar, superavitProyectado,
    };
  }, [
    transactions, accounts, installments,
    onboarding.ingreso_mensual, onboarding.objetivo_ahorro,
    diasRestantes, diasEnElMes, diaDelMes, thisMonth, nextMonth,
  ]);

  const {
    totalIngresos, totalGastos, neto,
    liquidTotal, creditDebt, realDisponible,
    cuotasEsteMes, cuotasProxMes,
    gastoDiario, vaALlegar, superavitProyectado, ingresoRef,
  } = financials;

  // ── Estado del hero ────────────────────────────────────────────────────────
  const estado = useMemo((): Estado => {
    const sinDatos = totalIngresos === 0 && totalGastos === 0 && accounts.length === 0;
    if (sinDatos) return 'sin_datos';
    if (ingresoRef === 0 && accounts.length === 0) return 'sin_ingreso';

    const pocasMuestras = transactions.length < 3;
    if (pocasMuestras && totalIngresos > 0) return 'estimacion';

    const base = accounts.length > 0 ? realDisponible : neto;
    const ratio = ingresoRef > 0 ? base / ingresoRef : 0;
    if (ratio >= 0.20) return 'bien';
    if (ratio >= 0.05) return 'cuidado';
    return 'mal';
  }, [totalIngresos, totalGastos, accounts.length, transactions.length, ingresoRef, realDisponible, neto]);

  const cfg = ESTADO_CFG[estado];

  // Número principal del hero
  const heroAmount = accounts.length > 0 ? realDisponible : neto;
  const showHeroNumber = estado !== 'sin_datos' && estado !== 'sin_ingreso';

  // ── Zona 4: Lo urgente ─────────────────────────────────────────────────────
  const urgentes = useMemo(() => {
    const items: Array<{ text: string; onClick?: () => void }> = [];

    // Budgets excedidos
    budgets
      .filter(b => b.limite > 0)
      .map(b => {
        const pct = (b.gastado / b.limite) * 100;
        const remaining = b.limite - b.gastado;
        return { b, pct, remaining };
      })
      .filter(({ pct }) => pct >= 85)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .forEach(({ b, pct, remaining }) => {
        if (pct >= 100) {
          items.push({
            text: `🔴 ${b.categoriaId} superó el límite en ${fmt(Math.abs(remaining))}`,
            onClick: onNavigateToBudgets,
          });
        } else {
          items.push({
            text: `🟠 ${b.categoriaId} al ${Math.round(pct)}% — quedan ${fmt(remaining)}`,
            onClick: onNavigateToBudgets,
          });
        }
      });

    // Metas en riesgo
    if (items.length < 2) {
      goals
        .filter(g => g.fechaLimite && g.montoActual < g.montoObjetivo)
        .map(g => {
          const diasRestantesMeta = Math.ceil(
            (new Date(g.fechaLimite!).getTime() - Date.now()) / 86_400_000,
          );
          const pct = (g.montoActual / g.montoObjetivo) * 100;
          return { g, diasRestantesMeta, pct };
        })
        .filter(({ diasRestantesMeta, pct }) => diasRestantesMeta <= 30 && pct < 80)
        .slice(0, 2 - items.length)
        .forEach(({ g, diasRestantesMeta, pct }) => {
          items.push({
            text: `⚠️ ${g.titulo} vence en ${diasRestantesMeta} días y va al ${Math.round(pct)}%`,
            onClick: onNavigateToMetas,
          });
        });
    }

    return items;
  }, [budgets, goals, onNavigateToBudgets, onNavigateToMetas]);

  // ── Zona 5: Metas activas ─────────────────────────────────────────────────
  const metasActivas = useMemo(
    () => goals.filter(g => g.montoActual < g.montoObjetivo).slice(0, 2),
    [goals],
  );

  // ── Zona 6: Actividad reciente ────────────────────────────────────────────
  const recientes = useMemo(
    () => [...transactions]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 3),
    [transactions],
  );

  // ── Liquid accounts para Zona 3 ───────────────────────────────────────────
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
      style={{ background: 'transparent' }}
    >

      {/* ══════════════════════════════════════════════════════════
          ZONA 1 — EL NÚMERO DEL DÍA (hero)
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: '#0D1410',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Header: saludo + badge */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-white/30 text-xs">
            {onboarding.nombre ? `Hola, ${onboarding.nombre}` : 'Tu resumen'}
            {' · '}{MESES[hoy.getMonth()]}
          </p>
          <span
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.badgeClass}`}
          >
            {cfg.badge}
          </span>
        </div>

        {/* Hero number o CTA */}
        {!showHeroNumber ? (
          /* CTA: sin ingreso o sin datos */
          <button
            onClick={() => onNavigateToChat()}
            className="w-full text-left mb-5"
          >
            <p className="text-white/25 text-xs mb-2">{cfg.heroLabel}</p>
            <div
              className="rounded-xl px-4 py-3.5 border border-white/8 bg-white/4 flex items-center gap-3 hover:bg-white/6 active:scale-[.98] transition-all group"
            >
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
          /* Número grande */
          <div className="mb-5">
            <p className="text-white/30 text-xs mb-1">{cfg.heroLabel}</p>
            <p
              className="text-[52px] font-bold tracking-tight tabular-nums leading-none mb-1"
              style={{ color: cfg.color }}
            >
              {heroAmount < 0 ? '-' : ''}{fmt(heroAmount)}
            </p>
            {onboarding.objetivo_ahorro > 0 && (
              <p className="text-white/30 text-xs mt-2">
                Para llegar a fin de mes ahorrando {fmt(onboarding.objetivo_ahorro)}/mes
              </p>
            )}
          </div>
        )}

        {/* Mensaje de estado emocional */}
        <p className="text-white/45 text-sm mb-4">{cfg.msg}</p>

        {/* Barra de progreso del mes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/20 text-[10px]">{pctMes}% del mes</span>
            <span className="text-white/20 text-[10px]">{diasRestantes} días restantes</span>
          </div>
          <div className="h-0.5 bg-white/6 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pctMes}%`, backgroundColor: cfg.color, opacity: 0.4 }}
            />
          </div>
        </div>

        {/* CTAs inline siempre presentes */}
        <div className="flex gap-2">
          <button
            onClick={onNavigateToChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 active:scale-[.97] transition-all text-white/60 text-xs font-medium"
          >
            ✏️ Registrar gasto
          </button>
          {gastoDiario > 0 && (
            <div className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-[#00C853]/8 border border-[#00C853]/15 text-[#00C853]/70 text-xs font-medium">
              <span>{fmt(gastoDiario)}/día disponible</span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ZONA 2 — PROYECCIÓN (una línea)
      ══════════════════════════════════════════════════════════ */}
      {showHeroNumber && ingresoRef > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-2"
          style={{
            background: vaALlegar ? 'rgba(0,200,83,0.06)' : 'rgba(255,82,82,0.06)',
            border: vaALlegar ? '1px solid rgba(0,200,83,0.12)' : '1px solid rgba(255,82,82,0.12)',
          }}
        >
          {vaALlegar
            ? <TrendingUp size={13} className="text-green-400 shrink-0" />
            : <TrendingDown size={13} className="text-red-400 shrink-0" />}
          <p
            className="text-sm"
            style={{ color: vaALlegar ? '#4ADE80' : '#F87171' }}
          >
            {vaALlegar
              ? `📈 A este ritmo cerrás con ${fmt(superavitProyectado)} de sobra`
              : `📉 A este ritmo te faltan ${fmt(Math.abs(superavitProyectado))} para llegar`}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ZONA 3 — CUENTAS (solo si accounts.length > 0)
      ══════════════════════════════════════════════════════════ */}
      {accounts.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
              Mis cuentas
            </p>
            <button
              onClick={() => setShowAccountModal(true)}
              className="text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors flex items-center gap-1"
            >
              + Nueva <ChevronRight size={11} />
            </button>
          </div>

          {/* Scroll horizontal de cuentas liquid */}
          {liquidAccounts.length > 0 && (
            <div className="flex gap-2 px-4 overflow-x-auto pb-3 scrollbar-hide">
              {liquidAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="flex-shrink-0 rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-[130px]"
                  style={{
                    background: acc.color ? `${acc.color}12` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${acc.color ? `${acc.color}20` : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {accountIcon(acc.type)}
                  <div className="min-w-0">
                    <p className="text-white/50 text-[10px] truncate">{acc.name}</p>
                    <p className="text-white/80 text-sm font-semibold tabular-nums">
                      {fmt(acc.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Separador + tarjetas */}
          {creditAccounts.length > 0 && totalCredit > 0 && (
            <div className="mx-4 pt-3 border-t border-white/5">
              <p className="text-[#FF5252]/60 text-xs mb-2">
                💳 Comprometido en tarjetas: {fmt(totalCredit)}
              </p>
            </div>
          )}

          {/* Disponible real */}
          <div
            className="mx-4 mb-4 mt-1 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-white/30 text-[10px] mb-0.5">Disponible real</p>
            <p className="text-white/25 text-[9px] mb-1">Lo que realmente podés usar hoy</p>
            <p
              className="text-lg font-bold tabular-nums"
              style={{ color: realDisponible >= 0 ? '#00C853' : '#FF5252' }}
            >
              {realDisponible < 0 ? '-' : ''}{fmt(realDisponible)}
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MÉTRICAS DEL MES (grid 3 cols)
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { label: 'Ingresos', value: totalIngresos, color: '#69F0AE', sign: '+' as const },
          { label: 'Gastos',   value: totalGastos,   color: '#FF5252', sign: '-' as const },
          { label: 'Neto',     value: Math.abs(neto), color: neto >= 0 ? '#69F0AE' : '#FF5252', sign: neto < 0 ? '-' as const : '' as const },
        ] as const).map(item => (
          <div
            key={item.label}
            className="rounded-xl p-3 text-center"
            style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="text-white/25 text-[10px] mb-1">{item.label}</p>
            <p className="font-bold text-sm tabular-nums" style={{ color: item.color }}>
              {item.sign}{fmt(item.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ZONA 4 — LO URGENTE (condicional, max 2 items)
      ══════════════════════════════════════════════════════════ */}
      {urgentes.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest px-4 pt-4 pb-2">
            Urgente
          </p>
          {urgentes.map((item, i) => (
            <UrgentItem key={i} text={item.text} onClick={item.onClick} />
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ZONA 5 — METAS (colapsable, max 2)
      ══════════════════════════════════════════════════════════ */}
      {metasActivas.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
              Metas
            </p>
            <button
              onClick={onNavigateToMetas}
              className="flex items-center gap-1 text-[#00C853]/50 text-xs hover:text-[#00C853] transition-colors"
            >
              Ver todas <ChevronRight size={11} />
            </button>
          </div>
          {metasActivas.map(meta => (
            <GoalRow
              key={meta.id}
              icono={meta.icono}
              titulo={meta.titulo}
              pct={(meta.montoActual / meta.montoObjetivo) * 100}
            />
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ZONA 6 — ACTIVIDAD RECIENTE
      ══════════════════════════════════════════════════════════ */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
            Actividad reciente
          </p>
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
            <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0 group-hover:bg-white/8 transition-colors">
              ✏️
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/55 text-sm">Registrá tu primer gasto</p>
              <p className="text-white/25 text-xs">Hablá con el coach →</p>
            </div>
            <ArrowRight size={14} className="text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
          </button>
        ) : (
          <div className="pb-2">
            {recientes.map((t, idx) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${idx < recientes.length - 1 ? 'border-b border-white/4' : ''}`}
              >
                <div className="w-8 h-8 bg-white/4 rounded-xl flex items-center justify-center text-sm shrink-0">
                  {getEmojiCategoria(t.categoria?.id || 'otros')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-sm truncate">{t.descripcion}</p>
                  <p className="text-white/25 text-[10px]">{fechaRelativa(t.fecha)}</p>
                </div>
                <p
                  className="text-sm font-medium tabular-nums shrink-0"
                  style={{ color: t.tipo === 'ingreso' ? '#69F0AE' : 'rgba(255,255,255,0.45)' }}
                >
                  {t.tipo === 'ingreso' ? '+' : '-'}{fmt(Number(t.monto))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ESTADO VACÍO — usuario nuevo sin nada
      ══════════════════════════════════════════════════════════ */}
      {transactions.length === 0 && accounts.length === 0 && (
        <div
          className="rounded-2xl p-5"
          style={{ background: '#111714', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-4">
            Empecemos
          </p>
          <div className="space-y-1">
            {([
              {
                icon: '💬',
                title: 'Registrá tu primer gasto',
                desc: 'Hablá con el coach — es más rápido de lo que parece',
                action: onNavigateToChat,
              },
              {
                icon: '🏦',
                title: 'Conectá tus cuentas',
                desc: 'Para ver tu dinero real en un solo lugar',
                action: () => setShowAccountModal(true),
              },
              {
                icon: '🎯',
                title: 'Creá tu primera meta',
                desc: 'Decile al coach para qué estás ahorrando',
                action: onNavigateToMetas,
              },
            ] as const).map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="w-full flex items-center gap-3 text-left p-2.5 rounded-xl hover:bg-white/4 active:bg-white/6 transition-colors group"
              >
                <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0 group-hover:bg-white/8 transition-colors">
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

      {/* ══════════════════════════════════════════════════════════
          ACCOUNT MODAL
      ══════════════════════════════════════════════════════════ */}
      {showAccountModal && (
        <AccountModal
          isFirstAccount={accounts.length === 0}
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
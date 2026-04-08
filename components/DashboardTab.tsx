'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard, Landmark, PiggyBank, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, Zap, Target,
  ArrowRight, Flame, Clock
} from 'lucide-react';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import AccountModal from './AccountModal';
import { supabase } from '../lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────
interface DashboardTabProps {
  selectedMonth: string;
  onNavigateToChat?: () => void;
  onNavigateToMetas?: () => void;
  onNavigateToBudgets?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;

const getEmojiCategoria = (cat: string): string => {
  const m: Record<string, string> = {
    alimentacion: '🍔', comida: '🍔', supermercado: '🛒', super: '🛒',
    transporte: '🚌', nafta: '🚌', salidas: '🎉', entretenimiento: '🎉',
    sueldo: '💼', salario: '💼', ahorro: '💰', servicios: '💡',
    suscripciones: '📱', salud: '💊', farmacia: '💊', ropa: '👕',
    mascotas: '🐕', gym: '💪', educacion: '📚', viaje: '✈️', otros: '📦',
  };
  const key = Object.keys(m).find(k => cat.toLowerCase().includes(k));
  return key ? m[key] : '📦';
};

const fechaRelativa = (d: string): string => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7)  return `Hace ${diff} días`;
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ─── Sub-componente: Insight pill accionable ─────────────────
function InsightPill({
  icon, text, color, onClick
}: { icon: React.ReactNode; text: string; color: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all active:scale-95 ${color}`}
    >
      {icon}
      <span>{text}</span>
      {onClick && <ArrowRight size={10} className="opacity-50" />}
    </button>
  );
}

// ─── Sub-componente: Sección con título ──────────────────────
function Section({
  title, action, actionLabel, children
}: {
  title: string; action?: () => void; actionLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-[#111714] border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">{title}</p>
        {action && (
          <button onClick={action} className="flex items-center gap-1 text-[#00C853]/70 text-xs hover:text-[#00C853] transition-colors">
            {actionLabel} <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────
export default function DashboardTab({
  selectedMonth, onNavigateToChat, onNavigateToMetas, onNavigateToBudgets
}: DashboardTabProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [onboarding, setOnboarding] = useState({ ingreso_mensual: 0, objetivo_ahorro: 0 });

  const { transactions, goals, accounts, installments, createAccount, refresh } =
    useSimpleAdaptedData(selectedMonth);

  // ── Cargar nombre del usuario ──
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const stored = localStorage.getItem(`ai_wallet_onboarding_${user.id}`);
      if (stored) {
        const d = JSON.parse(stored);
        setNombre(d.nombre || '');
        setOnboarding({ ingreso_mensual: d.ingreso_mensual || 0, objetivo_ahorro: d.objetivo_ahorro || 0 });
      }
    };
    load();
  }, []);

  // ── Cálculos de cuentas ──────────────────────────────────────
  const hoy      = new Date();
  const thisMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const nextDate  = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  const hasAccounts  = accounts.length > 0;
  const liquidTotal  = accounts.filter(a => a.type === 'liquid' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
  const creditDebt   = installments.filter(i => !i.is_paid).reduce((s, i) => s + i.amount, 0);
  const realAvailable = liquidTotal - creditDebt;

  const debtByAccount: Record<string, number> = {};
  installments.filter(i => !i.is_paid).forEach(i => {
    debtByAccount[i.account_id] = (debtByAccount[i.account_id] || 0) + i.amount;
  });

  const cuotasEsteMes = installments.filter(i => i.due_month === thisMonth && !i.is_paid).reduce((s, i) => s + i.amount, 0);
  const cuotasProxMes = installments.filter(i => i.due_month === nextMonth && !i.is_paid).reduce((s, i) => s + i.amount, 0);

  // ── Cálculos de transacciones ────────────────────────────────
  const totalIngresos = transactions.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + Number(t.monto), 0);
  const totalGastos   = transactions.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Math.abs(Number(t.monto)), 0);
  const neto          = totalIngresos - totalGastos;

  const ingresoRef    = totalIngresos > 0 ? totalIngresos : (onboarding.ingreso_mensual || 1);
  const heroAmount    = hasAccounts ? realAvailable : neto;
  const ratio         = heroAmount / ingresoRef;

  // Sin datos reales todavía → estado neutro, no alarmar al usuario nuevo
  const sinDatosReales = !hasAccounts && totalIngresos === 0 && totalGastos === 0;

  // ── Estado del héroe ─────────────────────────────────────────
  type Estado = 'neutro' | 'solido' | 'bien' | 'cuidado' | 'justo' | 'mal';
  const estado: Estado = sinDatosReales ? 'neutro' :
    ratio >= 0.30 ? 'solido' : ratio >= 0.15 ? 'bien' :
    ratio >= 0.05 ? 'cuidado' : ratio >= 0 ? 'justo' : 'mal';

  const estadoCfg: Record<Estado, { color: string; bg: string; border: string; badge: string; badgeColor: string; emoji: string; msg: string }> = {
    neutro:  { color: '#69F0AE', bg: '#0D1410', border: 'rgba(255,255,255,.06)', badge: 'Empecemos', badgeColor: 'text-white/40 bg-white/5 border-white/10', emoji: '👋', msg: 'Registrá tus primeros gastos para ver tu situación real.' },
    solido:  { color: '#69F0AE', bg: '#061a0e', border: 'rgba(0,200,83,.2)',  badge: 'Estás sólido',  badgeColor: 'text-[#69F0AE] bg-[#00C853]/15 border-[#00C853]/20', emoji: '💚', msg: 'Tu posición es saludable.' },
    bien:    { color: '#69F0AE', bg: '#0A1F14', border: 'rgba(0,200,83,.12)', badge: 'Vas bien',       badgeColor: 'text-[#69F0AE] bg-[#00C853]/10 border-[#00C853]/15', emoji: '🟢', msg: 'Seguí el ritmo hasta fin de mes.' },
    cuidado: { color: '#FFD740', bg: '#1C1600', border: 'rgba(255,215,64,.2)', badge: 'Poco margen',   badgeColor: 'text-[#FFD740] bg-[#FFD740]/10 border-[#FFD740]/20', emoji: '🟡', msg: 'Pensalo dos veces antes de gastar.' },
    justo:   { color: '#FF6D00', bg: '#1C1000', border: 'rgba(255,109,0,.2)', badge: 'Muy justo',      badgeColor: 'text-[#FF6D00] bg-[#FF6D00]/10 border-[#FF6D00]/20', emoji: '🟠', msg: 'Estás muy justo. Bajá gastos ya.' },
    mal:     { color: '#FF5252', bg: '#1C0505', border: 'rgba(255,82,82,.2)', badge: 'En rojo',         badgeColor: 'text-[#FF5252] bg-[#FF5252]/10 border-[#FF5252]/20', emoji: '🔴', msg: 'Tu deuda supera tu efectivo. Revisá.' },
  };
  const cfg = estadoCfg[estado];

  // ── Día del mes y días restantes ─────────────────────────────
  const diaDelMes     = hoy.getDate();
  const diasEnElMes   = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = diasEnElMes - diaDelMes;
  const pctMes        = Math.round((diaDelMes / diasEnElMes) * 100);

  // ── Gasto diario recomendado ─────────────────────────────────
  const disponibleParaGastar = hasAccounts
    ? Math.max(0, realAvailable)
    : Math.max(0, (onboarding.ingreso_mensual - onboarding.objetivo_ahorro) - totalGastos);
  const gastoDiario = diasRestantes > 0 ? Math.round(disponibleParaGastar / diasRestantes) : 0;

  // ── Meta más urgente ─────────────────────────────────────────
  const metaActiva = goals
    .filter(g => g.montoActual < g.montoObjetivo)
    .sort((a, b) => {
      if (a.fechaLimite && b.fechaLimite) return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
      if (a.fechaLimite) return -1;
      if (b.fechaLimite) return 1;
      const pA = a.montoActual / a.montoObjetivo;
      const pB = b.montoActual / b.montoObjetivo;
      return pB - pA;
    })[0];

  // ── Categoría más gastada ────────────────────────────────────
  const catMap: Record<string, number> = {};
  transactions.filter(t => t.tipo === 'gasto').forEach(t => {
    const cat = t.categoria?.id || 'otros';
    catMap[cat] = (catMap[cat] || 0) + Math.abs(Number(t.monto));
  });
  const topCat = Object.entries(catMap)
    .filter(([cat]) => cat !== 'otros')
    .sort((a, b) => b[1] - a[1])[0];

  // ── Actividad reciente ───────────────────────────────────────
  const recientes = [...transactions]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 4);

  // ── Metas ────────────────────────────────────────────────────
  const metasConProgreso = goals.filter(g => g.montoActual < g.montoObjetivo).slice(0, 3);

  // ── Insights dinámicos ───────────────────────────────────────
  const insights: Array<{ icon: React.ReactNode; text: string; color: string; action?: () => void }> = [];

  if (gastoDiario > 0 && diasRestantes > 0) {
    insights.push({
      icon: <Zap size={11} />,
      text: `${fmt(gastoDiario)}/día disponible`,
      color: 'text-[#69F0AE] border-[#00C853]/20 bg-[#00C853]/8 hover:bg-[#00C853]/15',
      action: onNavigateToChat,
    });
  }

  if (cuotasEsteMes > 0) {
    insights.push({
      icon: <AlertTriangle size={11} />,
      text: `${fmt(cuotasEsteMes)} en cuotas este mes`,
      color: 'text-[#FF6D00] border-[#FF6D00]/20 bg-[#FF6D00]/8 hover:bg-[#FF6D00]/15',
    });
  }

  if (topCat) {
    insights.push({
      icon: <TrendingUp size={11} />,
      text: `Mayor gasto: ${topCat[0]} (${fmt(topCat[1])})`,
      color: 'text-white/50 border-white/10 bg-white/4 hover:bg-white/8',
      action: onNavigateToBudgets,
    });
  }

  if (metaActiva) {
    const pct = Math.round((metaActiva.montoActual / metaActiva.montoObjetivo) * 100);
    insights.push({
      icon: <Target size={11} />,
      text: `${metaActiva.titulo} al ${pct}%`,
      color: 'text-[#69F0AE] border-[#00C853]/15 bg-[#00C853]/5 hover:bg-[#00C853]/12',
      action: onNavigateToMetas,
    });
  }

  // ── Account icon ─────────────────────────────────────────────
  const accountIcon = (type: string) => {
    if (type === 'credit')  return <CreditCard size={13} className="text-white/25 shrink-0" />;
    if (type === 'savings') return <PiggyBank  size={13} className="text-white/25 shrink-0" />;
    return                         <Landmark   size={13} className="text-white/25 shrink-0" />;
  };

  return (
    <div className="space-y-3 pb-24 md:pb-6">

      {/* ═══ HERO — DISPONIBLE REAL ══════════════════════════════ */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        {/* Saludo */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-white/30 text-xs">
            {nombre ? `Hola, ${nombre}` : 'Tu resumen'} · {MESES[hoy.getMonth()]}
          </p>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${cfg.badgeColor}`}>
            {cfg.badge}
          </span>
        </div>

        {/* Número principal */}
        <div className="mb-1">
          <p className="text-white/35 text-xs mb-1">
            {hasAccounts ? 'Disponible real' : 'Libre este mes'}
          </p>
          <p className="text-5xl font-bold tracking-tight tabular-nums" style={{ color: cfg.color }}>
            {heroAmount < 0 ? '-' : ''}{fmt(heroAmount)}
          </p>
        </div>

        <p className="text-white/50 text-sm mb-5">{cfg.msg}</p>

        {/* Barra de progreso del mes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/25 text-[10px]">Mes {pctMes}% completado</span>
            <span className="text-white/25 text-[10px]">{diasRestantes} días restantes</span>
          </div>
          <div className="h-1 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pctMes}%`, backgroundColor: cfg.color, opacity: 0.5 }}
            />
          </div>
        </div>

        {/* Insights pills */}
        {insights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {insights.map((ins, i) => (
              <InsightPill key={i} icon={ins.icon} text={ins.text} color={ins.color} onClick={ins.action} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ ACCIÓN PRINCIPAL — COACH CTA ═══════════════════════ */}
      {transactions.length > 0 && (
        <button
          onClick={onNavigateToChat}
          className="w-full flex items-center gap-3 bg-[#00C853]/10 border border-[#00C853]/25 rounded-2xl px-4 py-3.5 hover:bg-[#00C853]/15 active:scale-[.98] transition-all group"
        >
          <div className="w-9 h-9 bg-[#00C853]/20 rounded-xl flex items-center justify-center text-base shrink-0">🤖</div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-white font-semibold text-sm">Hablá con tu coach</p>
            <p className="text-white/35 text-xs truncate">
              {gastoDiario > 0 ? `Podés gastar ${fmt(gastoDiario)} hoy sin pasarte` : 'Registrá gastos, consultá, planificá'}
            </p>
          </div>
          <ArrowRight size={16} className="text-[#00C853]/50 group-hover:text-[#00C853] transition-colors shrink-0" />
        </button>
      )}

      {/* ═══ MÉTRICAS DEL MES ════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Ingresos', value: totalIngresos, color: '#69F0AE', icon: <TrendingUp size={10} />, sign: '+' },
          { label: 'Gastos',   value: totalGastos,   color: '#FF5252', icon: <TrendingDown size={10} />, sign: '-' },
          { label: 'Neto',     value: Math.abs(neto), color: neto >= 0 ? '#69F0AE' : '#FF5252', icon: null, sign: neto < 0 ? '-' : '' },
        ].map(item => (
          <div key={item.label} className="bg-[#111714] border border-white/5 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1.5 opacity-40" style={{ color: item.color }}>
              {item.icon}
              <p className="text-white/30 text-[10px]">{item.label}</p>
            </div>
            <p className="font-bold text-sm tabular-nums" style={{ color: item.color }}>
              {item.sign}{fmt(item.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ═══ CUENTAS ═════════════════════════════════════════════ */}
      <Section
        title="Mis cuentas"
        action={() => setShowAccountModal(true)}
        actionLabel="+ Nueva"
      >
        {!hasAccounts ? (
          <button
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-3 px-4 pb-4 w-full text-left group"
          >
            <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0 group-hover:bg-white/8 transition-colors">🏦</div>
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-sm">Agregá tu primera cuenta</p>
              <p className="text-white/25 text-xs">Efectivo, banco o tarjeta de crédito</p>
            </div>
            <ChevronRight size={14} className="text-white/15 shrink-0" />
          </button>
        ) : (
          <div className="px-4 pb-4">
            <div className="space-y-0 mb-3">
              {accounts.map((acc, idx) => {
                const debt   = acc.type === 'credit' ? (debtByAccount[acc.id] || 0) : 0;
                const display = acc.type === 'credit' ? -debt : acc.balance;
                const neg     = display < 0;
                return (
                  <div key={acc.id} className={`flex items-center justify-between py-2.5 ${idx < accounts.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {accountIcon(acc.type)}
                      <span className="text-white/65 text-sm truncate">{acc.name}</span>
                      {acc.is_default && <span className="text-[#00C853]/35 text-[10px] shrink-0">principal</span>}
                    </div>
                    <p className={`text-sm font-medium tabular-nums shrink-0 ml-2 ${neg ? 'text-[#FF5252]' : 'text-white/75'}`}>
                      {neg ? '-' : ''}{fmt(Math.abs(display))}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Footer de totales */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
              <div className="bg-white/4 rounded-xl px-3 py-2.5">
                <p className="text-white/25 text-[10px] mb-0.5">Efectivo total</p>
                <p className="text-white font-semibold text-sm tabular-nums">{fmt(liquidTotal)}</p>
              </div>
              <div className="bg-white/4 rounded-xl px-3 py-2.5">
                <p className="text-white/25 text-[10px] mb-0.5">Deuda cuotas</p>
                <p className={`font-semibold text-sm tabular-nums ${creditDebt > 0 ? 'text-[#FF5252]' : 'text-white/25'}`}>
                  {creditDebt > 0 ? `-${fmt(creditDebt)}` : '$0'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ═══ PRESIÓN DE CUOTAS (solo si aplica) ═════════════════ */}
      {(cuotasEsteMes > 0 || cuotasProxMes > 0) && (
        <div className="bg-[#1C1000] border border-[#FF6D00]/20 rounded-2xl px-4 py-3.5 space-y-2">
          <div className="flex items-center gap-2 mb-0.5">
            <Flame size={13} className="text-[#FF6D00]" />
            <p className="text-[#FF6D00] text-xs font-semibold uppercase tracking-widest">Presión de cuotas</p>
          </div>
          {cuotasEsteMes > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-white/55 text-sm">Este mes</p>
              <p className="text-[#FF5252] font-semibold text-sm tabular-nums">-{fmt(cuotasEsteMes)}</p>
            </div>
          )}
          {cuotasProxMes > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-white/35 text-sm">En {MESES[nextDate.getMonth()]}</p>
              <p className="text-white/45 font-medium text-sm tabular-nums">-{fmt(cuotasProxMes)}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ METAS ═══════════════════════════════════════════════ */}
      {metasConProgreso.length > 0 && (
        <Section title="Mis metas" action={onNavigateToMetas} actionLabel="Ver todas">
          <div className="px-4 pb-4 space-y-4">
            {metasConProgreso.map((meta, idx) => {
              const pct     = Math.min((meta.montoActual / meta.montoObjetivo) * 100, 100);
              const faltante = meta.montoObjetivo - meta.montoActual;
              const esUrgente = idx === 0 && meta.fechaLimite
                ? new Date(meta.fechaLimite).getTime() - Date.now() < 90 * 86400000
                : false;

              return (
                <div key={meta.id} className={idx < metasConProgreso.length - 1 ? 'pb-4 border-b border-white/5' : ''}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{meta.icono}</span>
                      <div className="min-w-0">
                        <p className="text-white/80 text-sm truncate font-medium">{meta.titulo}</p>
                        <p className="text-white/30 text-xs">
                          {fmt(meta.montoActual)} de {fmt(meta.montoObjetivo)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right ml-3">
                      <p className="text-white/60 text-sm font-semibold tabular-nums">{Math.round(pct)}%</p>
                      {esUrgente && (
                        <span className="text-[10px] text-[#FF6D00] flex items-center gap-0.5 justify-end">
                          <Clock size={9} /> urgente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="h-1.5 bg-white/6 rounded-full overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct >= 75 ? '#00C853' : pct >= 40 ? '#FFD740' : '#FF6D00'
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-white/25 text-[10px]">Faltante: {fmt(faltante)}</p>
                    <button
                      onClick={onNavigateToChat}
                      className="text-[10px] text-[#00C853]/60 hover:text-[#00C853] transition-colors"
                    >
                      Aportar →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ══════════════════════════════════ */}
      {recientes.length > 0 && (
        <Section title="Actividad reciente">
          <div className="px-4 pb-4 space-y-0">
            {recientes.map((t, idx) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 py-2.5 ${idx < recientes.length - 1 ? 'border-b border-white/4' : ''}`}
              >
                <div className="w-8 h-8 bg-white/4 rounded-xl flex items-center justify-center text-sm shrink-0">
                  {getEmojiCategoria(t.categoria?.id || 'otros')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/75 text-sm truncate">{t.descripcion}</p>
                  <p className="text-white/25 text-[10px]">{fechaRelativa(t.fecha)}</p>
                </div>
                <p className={`text-sm font-medium tabular-nums shrink-0 ${t.tipo === 'ingreso' ? 'text-[#69F0AE]' : 'text-white/50'}`}>
                  {t.tipo === 'ingreso' ? '+' : '-'}{fmt(Number(t.monto))}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══ ESTADO VACÍO (usuario nuevo) ════════════════════════ */}
      {transactions.length === 0 && (
        <div className="bg-[#111714] border border-white/5 rounded-2xl p-5">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3">Empecemos</p>
          <div className="space-y-3">
            {[
              { icon: '💬', title: 'Registrá tu primer gasto', desc: 'Hablá con el coach — es más rápido de lo que parece', action: onNavigateToChat },
              { icon: '🏦', title: 'Conectá tus cuentas', desc: 'Para ver tu dinero real en un solo lugar', action: () => setShowAccountModal(true) },
              { icon: '🎯', title: 'Creá tu primera meta', desc: 'Decile al coach para qué estás ahorrando', action: onNavigateToMetas },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={item.action}
                className="w-full flex items-center gap-3 text-left group p-2 -mx-2 rounded-xl hover:bg-white/4 active:bg-white/6 transition-colors"
              >
                <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-lg shrink-0 group-hover:bg-white/8 transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-sm font-medium">{item.title}</p>
                  <p className="text-white/30 text-xs">{item.desc}</p>
                </div>
                <ArrowRight size={14} className="text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ACCOUNT MODAL ═══════════════════════════════════════ */}
      {showAccountModal && (
        <AccountModal
          isFirstAccount={!hasAccounts}
          createAccount={createAccount}
          onClose={() => setShowAccountModal(false)}
          onSuccess={() => { setShowAccountModal(false); refresh(); }}
        />
      )}
    </div>
  );
}

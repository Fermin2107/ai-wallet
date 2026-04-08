'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, X, Check, Clock, ChevronRight } from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import { supabase } from '../lib/supabase';

interface GoalsTabProps {
  selectedMonth?: string;
  refreshTrigger?: number;
  onNavigateToChat?: () => void;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

// ─── Hitos ───────────────────────────────────────────────────
const HITOS = [25, 50, 75, 100] as const;
type Hito = typeof HITOS[number];

const hitoMensaje: Record<Hito, string> = {
  25:  '¡Primer cuarto! Ya arrancaste 🙌',
  50:  '¡Mitad del camino! Ya es real 🎯',
  75:  '¡Casi! Solo falta el 25% 🔥',
  100: '¡La completaste! Sos un crack 🎉',
};

const hitoColor: Record<Hito, string> = {
  25:  'text-white/50 bg-white/5',
  50:  'text-[#FFD740] bg-[#FFD740]/10',
  75:  'text-[#FF6D00] bg-[#FF6D00]/10',
  100: 'text-[#69F0AE] bg-[#00C853]/15',
};

function getHitoAlcanzado(pct: number): Hito | null {
  for (const h of [...HITOS].reverse()) {
    if (pct >= h) return h;
  }
  return null;
}

// ─── Barra de progreso ───────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? '#00C853' : pct >= 40 ? '#FFD740' : '#FF6D00';
  return (
    <div className="h-2 bg-white/6 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="bg-[#0f1612] border border-white/10 rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="text-white font-semibold">{title}</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-white/40 text-xs block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00C853]/40";

export default function GoalsTab({ selectedMonth, refreshTrigger, onNavigateToChat }: GoalsTabProps) {
  const { goals, loading, refresh, updateGoal, createGoal } = useSimpleSupabase();

  const [onboarding, setOnboarding]   = useState({ ingreso_mensual: 0, objetivo_ahorro: 0 });
  const [showCreate, setShowCreate]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [hitos, setHitos]             = useState<Record<string, Hito>>({});

  // ── Form state ──
  const [form, setForm] = useState({
    name: '', icon: '🎯', target_amount: 0, current_amount: 0,
    target_date: '', color: 'text-emerald-500'
  });

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) refresh();
  }, [refreshTrigger]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const stored = localStorage.getItem(`ai_wallet_onboarding_${user.id}`);
      if (stored) setOnboarding(JSON.parse(stored));
    };
    load();
  }, []);

  // ── Detectar hitos alcanzados ──
  useEffect(() => {
    const nuevos: Record<string, Hito> = {};
    goals.filter(g => !g.is_completed).forEach(g => {
      const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
      const hito = getHitoAlcanzado(pct);
      if (!hito) return;
      const key = `hito_${g.id}_${hito}`;
      if (!localStorage.getItem(key)) {
        nuevos[g.id] = hito;
        localStorage.setItem(key, 'true');
      }
    });
    if (Object.keys(nuevos).length > 0) setHitos(prev => ({ ...prev, ...nuevos }));
  }, [goals]);

  // ── Cálculos ──
  const metasActivas     = goals.filter(g => !g.is_completed);
  const metasCompletadas = goals.filter(g => g.is_completed);
  const puedeCrear       = metasActivas.length < 3;

  const disponible    = Math.max(0, onboarding.ingreso_mensual - onboarding.objetivo_ahorro);
  const aportePorMeta = metasActivas.length > 0 ? disponible / metasActivas.length / 3 : 0;

  const openCreate = () => {
    setForm({ name: '', icon: '🎯', target_amount: 0, current_amount: 0, target_date: '', color: 'text-emerald-500' });
    setShowCreate(true);
  };

  const openEdit = (g: typeof goals[0]) => {
    setForm({
      name: g.name, icon: g.icon, target_amount: g.target_amount,
      current_amount: g.current_amount, target_date: g.target_date || '', color: g.color,
    });
    setEditingId(g.id);
  };

  const handleCreate = async () => {
    if (!form.name || form.target_amount <= 0) return;
    const ok = await createGoal({
      name: form.name, target_amount: form.target_amount,
      current_amount: 0, target_date: form.target_date || undefined,
      icon: form.icon, color: form.color,
    });
    if (ok) setShowCreate(false);
  };

  const handleUpdate = async () => {
    if (!editingId || !form.name || form.target_amount <= 0) return;
    const ok = await updateGoal(editingId, {
      name: form.name, target_amount: form.target_amount,
      current_amount: form.current_amount, target_date: form.target_date || undefined,
      icon: form.icon, color: form.color,
      is_completed: form.current_amount >= form.target_amount,
    });
    if (ok) setEditingId(null);
  };

  const pausar = async (id: string) => {
    await supabase.from('goals').update({ is_active: false }).eq('id', id);
    setEditingId(null);
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" />
      </div>
    );
  }

  const ICONS = ['🎯', '✈️', '💻', '🏠', '🚗', '📚', '🛡️', '💰', '🏖️', '🎸', '💊', '🐕'];

  return (
    <div className="space-y-4 pb-24 md:pb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Mis metas</h2>
          <p className="text-white/35 text-xs mt-0.5">
            {metasActivas.length}/3 activas
          </p>
        </div>
        {puedeCrear ? (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-[#00C853] text-black text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#00C853]/80 active:scale-95 transition-all"
          >
            <Plus size={15} /> Nueva
          </button>
        ) : (
          <div className="bg-[#141A17] border border-white/5 rounded-xl px-3 py-2 max-w-[160px] text-center">
            <p className="text-white/50 text-xs">Completá una antes de agregar otra</p>
          </div>
        )}
      </div>

      {/* ── Metas activas ── */}
      {metasActivas.length === 0 && (
        <div className="bg-[#111714] border border-white/5 rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-white/60 font-medium mb-1">Sin metas todavía</p>
          <p className="text-white/30 text-sm mb-4">Creá tu primera meta para empezar a ahorrar con propósito</p>
          <button onClick={openCreate} className="bg-[#00C853] text-black text-sm font-semibold px-5 py-2.5 rounded-xl">
            Crear mi primera meta
          </button>
        </div>
      )}

      <div className="space-y-3">
        {metasActivas.map((meta) => {
          const pct         = Math.min((meta.current_amount / meta.target_amount) * 100, 100);
          const faltante    = meta.target_amount - meta.current_amount;
          const hitoActual  = hitos[meta.id];
          const mesesRest   = aportePorMeta > 0 ? Math.ceil(faltante / aportePorMeta) : null;

          const diasHastaFecha = meta.target_date
            ? Math.ceil((new Date(meta.target_date).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <div key={meta.id} className="bg-[#111714] border border-white/5 rounded-2xl p-5">

              {/* Hito alcanzado — banner inline, no alert */}
              {hitoActual && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs font-medium ${hitoColor[hitoActual]}`}>
                  <span>🏆</span>
                  <span>{hitoMensaje[hitoActual]}</span>
                  <button
                    onClick={() => setHitos(prev => { const n = { ...prev }; delete n[meta.id]; return n; })}
                    className="ml-auto opacity-50 hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Header de la meta */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{meta.name}</p>
                    {diasHastaFecha !== null && (
                      <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${diasHastaFecha < 30 ? 'text-[#FF6D00]' : 'text-white/30'}`}>
                        <Clock size={9} />
                        {diasHastaFecha > 0 ? `${diasHastaFecha} días` : 'Vencida'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(meta)}
                  className="p-1.5 text-white/20 hover:text-white/50 transition-colors shrink-0"
                >
                  <Edit2 size={14} />
                </button>
              </div>

              {/* Barra */}
              <ProgressBar pct={pct} />

              {/* Números */}
              <div className="flex items-center justify-between mt-2">
                <p className="text-white/30 text-xs tabular-nums">
                  {fmt(meta.current_amount)} de {fmt(meta.target_amount)}
                </p>
                <p className="text-white/60 text-xs font-semibold tabular-nums">{Math.round(pct)}%</p>
              </div>

              {/* Proyección + acción */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <p className={`text-xs ${
                  mesesRest === null ? 'text-white/20' :
                  mesesRest <= 2 ? 'text-[#69F0AE]' :
                  mesesRest <= 6 ? 'text-[#FFD740]' : 'text-white/35'
                }`}>
                  {mesesRest === null
                    ? 'Sin proyección'
                    : mesesRest <= 1 ? '¡Este mes llegás! 🎉'
                    : `~${mesesRest} meses a este ritmo`}
                </p>
                <button
                  onClick={onNavigateToChat}
                  className="text-[10px] text-[#00C853]/60 hover:text-[#00C853] transition-colors flex items-center gap-1"
                >
                  Aportar <ChevronRight size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Metas completadas ── */}
      {metasCompletadas.length > 0 && (
        <div>
          <p className="text-white/25 text-[10px] font-semibold uppercase tracking-widest mb-2.5">
            Victorias 🏆 ({metasCompletadas.length})
          </p>
          <div className="space-y-2">
            {metasCompletadas.map(meta => (
              <div key={meta.id} className="flex items-center gap-3 bg-[#111714]/50 border border-white/4 rounded-xl px-4 py-3 opacity-55">
                <span className="text-lg shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/60 text-sm truncate">{meta.name}</p>
                  <p className="text-[#00C853]/60 text-xs">{fmt(meta.target_amount)} completado</p>
                </div>
                <Check size={15} className="text-[#00C853]/50 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal Crear ── */}
      {showCreate && (
        <Modal title="Nueva meta" onClose={() => setShowCreate(false)}>
          <Field label="¿Para qué estás ahorrando?">
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass} placeholder="Ej: Vacaciones en Brasil" autoFocus />
          </Field>
          <Field label="Ícono">
            <div className="flex flex-wrap gap-2">
              {ICONS.map(ic => (
                <button key={ic} onClick={() => setForm(p => ({ ...p, icon: ic }))}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${form.icon === ic ? 'bg-[#00C853]/20 border border-[#00C853]/40' : 'bg-white/5 border border-white/8 hover:border-white/20'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </Field>
          <Field label="¿Cuánto necesitás?">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={form.target_amount || ''} onChange={e => setForm(p => ({ ...p, target_amount: parseFloat(e.target.value) || 0 }))}
                className={`${inputClass} pl-7`} placeholder="0" />
            </div>
          </Field>
          <Field label="Fecha límite (opcional)">
            <input type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))}
              className={inputClass} />
          </Field>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl text-sm">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={!form.name || form.target_amount <= 0}
              className="flex-1 bg-[#00C853] text-black font-semibold py-3 rounded-xl text-sm disabled:opacity-30">
              Crear meta
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal Editar ── */}
      {editingId && (
        <Modal title="Editar meta" onClose={() => setEditingId(null)}>
          <Field label="Nombre">
            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass} />
          </Field>
          <Field label="Monto objetivo">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={form.target_amount || ''} onChange={e => setForm(p => ({ ...p, target_amount: parseFloat(e.target.value) || 0 }))}
                className={`${inputClass} pl-7`} />
            </div>
          </Field>
          <Field label="Monto actual">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={form.current_amount || ''} onChange={e => setForm(p => ({ ...p, current_amount: parseFloat(e.target.value) || 0 }))}
                className={`${inputClass} pl-7`} />
            </div>
          </Field>
          <Field label="Fecha límite (opcional)">
            <input type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))}
              className={inputClass} />
          </Field>
          <div className="flex gap-3 mt-2">
            <button onClick={() => setEditingId(null)} className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl text-sm">
              Cancelar
            </button>
            <button onClick={handleUpdate} disabled={!form.name || form.target_amount <= 0}
              className="flex-1 bg-[#00C853] text-black font-semibold py-3 rounded-xl text-sm disabled:opacity-30">
              Guardar
            </button>
          </div>
          <button onClick={() => pausar(editingId)} className="w-full mt-3 text-[#FF5252]/60 hover:text-[#FF5252] text-sm py-2 transition-colors">
            Pausar esta meta
          </button>
        </Modal>
      )}
    </div>
  );
}

'use client'

import { supabase } from '../lib/supabase'

interface NavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  alertCount?: number
}

const tabs = [
  { id: 'dashboard', label: 'Inicio',   icon: '🏠' },
  { id: 'chat',      label: 'Coach',    icon: '💬' },
  { id: 'limites',   label: 'Límites',  icon: '💡' },
  { id: 'metas',     label: 'Metas',    icon: '🎯' },
]

export default function Navigation({ activeTab, onTabChange, alertCount = 0 }: NavigationProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }

  return (
    <>
      {/* ── Sidebar desktop ── */}
      <nav className="hidden md:flex flex-col w-60 h-full bg-[#0D1410] border-r border-white/5 p-4 gap-1 fixed left-0 top-0 z-30">
        <div className="flex items-center gap-2.5 p-3 mb-5">
          <div className="w-8 h-8 bg-[#00C853]/20 rounded-lg flex items-center justify-center text-sm">💰</div>
          <span className="text-white font-semibold text-sm">AI Wallet</span>
        </div>

        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors relative ${
              activeTab === tab.id
                ? 'bg-[#00C853]/10 text-[#00C853]'
                : 'text-white/40 hover:text-white/70 hover:bg-white/4'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
            {tab.id === 'chat' && alertCount > 0 && (
              <span className="ml-auto bg-[#FF5252] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/20 hover:text-white/40 transition-colors text-sm"
        >
          <span>🚪</span>
          <span>Salir</span>
        </button>
      </nav>

      {/* ── Bottom nav mobile ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0D1410]/95 backdrop-blur-md border-t border-white/8 flex z-50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors ${
              activeTab === tab.id ? 'text-[#00C853]' : 'text-white/35'
            }`}
          >
            {activeTab === tab.id && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#00C853] rounded-full" />
            )}
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
            {tab.id === 'chat' && alertCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-14px)] bg-[#FF5252] text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  )
}
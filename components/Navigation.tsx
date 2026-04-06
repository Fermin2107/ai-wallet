'use client'

import { supabase } from '../lib/supabase'

interface NavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  alertCount?: number
}

const tabs = [
  { id: 'dashboard', label: 'Inicio', icon: '🏠' },
  { id: 'chat', label: 'Coach', icon: '💬' },
  { id: 'metas', label: 'Metas', icon: '🎯' },
]

export default function Navigation({ 
  activeTab, 
  onTabChange,
  alertCount = 0
}: NavigationProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth'
  }
  return (
    <>
      <nav className="hidden md:flex flex-col w-64 h-full bg-[#0D1410] 
                      border-r border-white/5 p-4 gap-2 fixed left-0 top-0 z-30">
        <div className="flex items-center gap-3 p-3 mb-4">
          <div className="w-8 h-8 bg-[#00C853]/20 rounded-lg 
                          flex items-center justify-center text-sm">
            💰
          </div>
          <span className="text-white font-semibold">AI Wallet</span>
        </div>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl 
                       text-left transition-colors relative ${
              activeTab === tab.id
                ? 'bg-[#00C853]/10 text-[#00C853]'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="font-medium">{tab.label}</span>
            {tab.id === 'chat' && alertCount > 0 && (
              <span className="ml-auto bg-[#FF5252] text-white 
                               text-xs rounded-full w-5 h-5 
                               flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        ))}
        
        {/* Botón de logout */}
        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 px-4 py-3 
                     rounded-xl text-white/30 hover:text-white/60 
                     transition-colors text-sm"
        >
          <span>🚪</span>
          <span>Cerrar sesión</span>
        </button>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 
                      bg-[#0D1410] border-t border-white/10 
                      flex z-50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 
                       py-3 relative transition-colors ${
              activeTab === tab.id
                ? 'text-[#00C853]'
                : 'text-white/40'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
            {tab.id === 'chat' && alertCount > 0 && (
              <span className="absolute top-2 right-[calc(50%-14px)] 
                               bg-[#FF5252] text-white text-xs 
                               rounded-full w-4 h-4 
                               flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  )
}

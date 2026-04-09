'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleAuth = async () => {
    setLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        window.location.href = '/'
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        if (data.session) {
          window.location.href = '/'
        } else {
          setError('Revisá tu email para confirmar la cuenta.')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Invalid login credentials')) {
        setError('Email o contraseña incorrectos')
      } else if (msg.includes('User already registered')) {
        setError('Este email ya está registrado. Ingresá en vez de registrarte.')
      } else if (msg.includes('Password should be')) {
        setError('La contraseña debe tener al menos 6 caracteres')
      } else {
        setError(msg || 'Ocurrió un error, intentá de nuevo')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0F0D] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#00C853]/20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
            💰
          </div>
          <h1 className="text-white text-2xl font-bold">AI Wallet</h1>
          <p className="text-white/40 text-sm mt-1">Tu coach financiero personal</p>
        </div>

        <div className="flex bg-[#141A17] rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('login'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-[#00C853] text-black' : 'text-white/40'
            }`}
          >
            Ingresar
          </button>
          <button
            onClick={() => { setMode('register'); setError(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-[#00C853] text-black' : 'text-white/40'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <input
            type="email"
            placeholder="tu@email.com"
            autoComplete="email"
            className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />
        </div>

        {error && (
          <div className="bg-[#FF5252]/10 border border-[#FF5252]/20 rounded-xl p-3 mb-4">
            <p className="text-[#FF5252] text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold rounded-xl py-3 transition-colors"
        >
          {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>

      </div>
    </div>
  )
}

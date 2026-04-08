// ============================================================
// app/api/chat-sessions/route.ts
// GET  → lista de sesiones del usuario (para el sidebar)
// POST → crear sesión nueva
// DELETE → eliminar sesión
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClientWithToken } from '../../../lib/supabase'

async function getAuthenticatedClient(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return { supabase: null, userId: null }

  const token = authHeader.replace('Bearer ', '')
  const supabase = createSupabaseServerClientWithToken(token)
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

// GET /api/chat-sessions
export async function GET(request: NextRequest) {
  const { supabase, userId } = await getAuthenticatedClient(request)
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}

// POST /api/chat-sessions  { title }
export async function POST(request: NextRequest) {
  const { supabase, userId } = await getAuthenticatedClient(request)
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { title } = await request.json()

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: userId, title: (title || 'Nueva conversación').slice(0, 120) })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

// DELETE /api/chat-sessions  { sessionId }
export async function DELETE(request: NextRequest) {
  const { supabase, userId } = await getAuthenticatedClient(request)
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { sessionId } = await request.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 })

  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

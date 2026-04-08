// ============================================================
// app/api/chat-sessions/[sessionId]/messages/route.ts
// GET  → mensajes de una sesión (para restaurar el chat)
// POST → guardar un mensaje nuevo
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClientWithToken } from '../../../../../lib/supabase'

async function getAuthenticatedClient(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return { supabase: null, userId: null }

  const token = authHeader.replace('Bearer ', '')
  const supabase = createSupabaseServerClientWithToken(token)
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

// GET /api/chat-sessions/[sessionId]/messages
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { supabase, userId } = await getAuthenticatedClient(request)
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Verify the session belongs to the user before returning messages
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', params.sessionId)
    .eq('user_id', userId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, is_auto, created_at')
    .eq('session_id', params.sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data ?? [] })
}

// POST /api/chat-sessions/[sessionId]/messages
// Body: { role: 'user' | 'assistant', content: string, is_auto?: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { supabase, userId } = await getAuthenticatedClient(request)
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { role, content, is_auto = false } = await request.json()

  if (!role || !content) {
    return NextResponse.json({ error: 'role y content requeridos' }, { status: 400 })
  }

  // Explicit ownership check (RLS also enforces this)
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', params.sessionId)
    .eq('user_id', userId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: params.sessionId,
      user_id: userId,
      role,
      content,
      is_auto,
    })
    .select('id, role, content, is_auto, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}

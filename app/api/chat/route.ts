import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSupabaseServiceClient,
  createSupabaseServerClientWithToken,
} from '../../../lib/supabase'
import {
  classifyIntent,
  resolveAccount,
  runAIEngine,
  BudgetRow,
  GoalRow,
  AccountRow,
  InstallmentRow,
  RequestContext,
} from '../../../lib/ai-engine'

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITER — en memoria, por userId
// Para producción con múltiples instancias: reemplazar con Upstash Redis.
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 20
const RATE_LIMIT_WINDOW = 60_000

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now   = Date.now()
  const entry = rateLimitStore.get(identifier)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

setInterval(() => {
  const now = Date.now()
  Array.from(rateLimitStore.entries()).forEach(([key, entry]) => {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  })
}, 5 * 60_000)

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE INPUT — Zod
// ─────────────────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.object({}).passthrough(),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(5000),
  })).max(20).default([]),
})

type ValidatedRequest = z.infer<typeof requestSchema>

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Autenticación ─────────────────────────────────────────────────────
    const authHeader     = request.headers.get('Authorization')
    const internalUserId = request.headers.get('x-internal-user-id')
    const internalSecret = request.headers.get('x-internal-secret')

    const isInternalCall =
      internalUserId &&
      internalSecret &&
      internalSecret === process.env.INTERNAL_API_SECRET

    let userId: string | null = null
    let supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>

    if (isInternalCall) {
      userId = internalUserId
      console.info('[auth] internal call', { userId, ip: request.headers.get('x-forwarded-for') })

      const serviceClient = createSupabaseServiceClient()
      const { data: userCheck, error: userErr } = await serviceClient
        .from('user_profiles').select('user_id').eq('user_id', userId).single()
      if (userErr || !userCheck) {
        console.warn('[auth] internal call with unknown userId', { userId })
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })
      }
      supabaseClient = serviceClient as unknown as ReturnType<typeof createSupabaseServerClientWithToken>

    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const clientWithToken = createSupabaseServerClientWithToken(token)
      const { data: { user } } = await clientWithToken.auth.getUser()
      if (!user?.id) {
        return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
      }
      userId         = user.id
      supabaseClient = clientWithToken

    } else {
      console.warn('[auth] unauthenticated request', {
        ip: request.headers.get('x-forwarded-for'),
        ua: request.headers.get('user-agent')?.slice(0, 80),
      })
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // ── 2. Rate limiting ──────────────────────────────────────────────────────
    const { allowed, remaining } = checkRateLimit(`chat:${userId}`)
    if (!allowed) {
      console.warn('[rate-limit] exceeded', { userId })
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Esperá un momento.' },
        { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } }
      )
    }

    // ── 3. Validación del body ────────────────────────────────────────────────
    let parsed: ValidatedRequest
    try {
      const rawBody = await request.json()
      const result  = requestSchema.safeParse(rawBody)
      if (!result.success) {
        return NextResponse.json(
          { error: 'Input inválido', details: process.env.NODE_ENV === 'development' ? result.error.issues : undefined },
          { status: 400 }
        )
      }
      parsed = result.data
    } catch {
      return NextResponse.json({ error: 'Body no es JSON válido' }, { status: 400 })
    }

    const { message, context, history } = parsed

    // ── 4. Fetch de datos ─────────────────────────────────────────────────────
    let budgetsData:  BudgetRow[]  = []
    let goalsData:    GoalRow[]    = []
    let accountsData: AccountRow[] = []
    let unpaidInstallmentsTotal    = 0

    if (userId) {
      try {
        const [budgetsRes, goalsRes, accountsRes, installmentsRes] = await Promise.all([
          supabaseClient.from('budgets').select('id, category, custom_aliases').eq('user_id', userId),
          supabaseClient.from('goals').select('id, name, is_active, is_completed').eq('user_id', userId).eq('is_active', true),
          supabaseClient.from('accounts').select('id, name, type, balance, credit_limit, closing_day, due_day, is_default').eq('user_id', userId).eq('is_active', true),
          supabaseClient.from('installments').select('amount').eq('user_id', userId).eq('is_paid', false),
        ])

        budgetsData = ((budgetsRes.data ?? []) as Array<{ id: string; category: string; custom_aliases: unknown }>).map(b => ({
          id: b.id,
          category: b.category,
          custom_aliases: Array.isArray(b.custom_aliases) ? b.custom_aliases as string[] : [],
        }))
        goalsData    = (goalsRes.data ?? []) as GoalRow[]
        accountsData = (accountsRes.data ?? []) as AccountRow[]
        unpaidInstallmentsTotal = ((installmentsRes.data ?? []) as InstallmentRow[]).reduce((s, i) => s + Number(i.amount), 0)
      } catch (err) {
        console.error('[db] fetch error', err instanceof Error ? err.message : err)
      }
    }

    // ── 5. Resolución de cuenta ───────────────────────────────────────────────
    let serverResolvedAccountId: string | null = null
    const intentForAccountResolution = classifyIntent(message)

    if (userId && intentForAccountResolution === 'registro') {
      const { account_id, error: accError } = await resolveAccount(userId, message, context as RequestContext, supabaseClient)
      if (accError) {
        if (!isInternalCall) {
          const { data: accsForPicker } = await supabaseClient
            .from('accounts').select('id, name, type')
            .eq('user_id', userId).eq('is_active', true)
          return NextResponse.json({
            action: 'NEEDS_ACCOUNT_SELECTION',
            mensaje_respuesta: accError,
            data: { accounts: accsForPicker ?? [], pending_message: message },
          })
        }
      } else {
        serverResolvedAccountId = account_id
      }
    }

    // ── 6. Correr el engine ───────────────────────────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Groq API key no configurada' }, { status: 500 })
    }

    try {
      const { aiResponse } = await runAIEngine({
        message,
        context:                 context as RequestContext,
        history:                 history as Array<{ role: 'user' | 'assistant'; content: string }>,
        userId:                  userId!,
        budgetsData,
        goalsData,
        accountsData,
        serverResolvedAccountId,
        unpaidInstallmentsTotal,
        canal:                   'app',
        supabaseClient,
      })

      return NextResponse.json(aiResponse, {
        headers: { 'X-RateLimit-Remaining': String(remaining) },
      })

    } catch (actionError) {
      console.error('[action] error', actionError instanceof Error ? actionError.message : actionError)
      return NextResponse.json(
        { action: 'ERROR', error: 'Error ejecutando la acción', mensaje_respuesta: `No pude ejecutar tu solicitud: ${actionError instanceof Error ? actionError.message : 'Error desconocido'}` },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[route] unhandled error', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Error procesando la solicitud', details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined },
      { status: 500 }
    )
  }
}
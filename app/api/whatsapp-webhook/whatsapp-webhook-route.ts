// ============================================================
// AI Wallet — Webhook de entrada WhatsApp
// app/api/whatsapp-webhook/route.ts
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN!

// ─── GET — verificación del webhook con Meta ──────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verificado')
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// ─── POST — mensajes entrantes del usuario ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as MetaWebhookPayload

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' })
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value

        if (!value.messages || value.messages.length === 0) continue

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue

          const fromPhone = msg.from
          const text      = msg.text?.body ?? ''

          if (!text.trim()) continue

          const supabase: SupabaseClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )

          const { data: config } = await supabase
            .from('user_whatsapp_config')
            .select('user_id, nombre')
            .eq('phone_number', `+${fromPhone}`)
            .eq('is_active', true)
            .single()

          if (!config) {
            await sendWhatsappReply(
              fromPhone,
              'Para conectar tu cuenta de AI Wallet con WhatsApp, abrí la app y activá las notificaciones.',
              process.env.META_WHATSAPP_TOKEN!,
              process.env.META_PHONE_NUMBER_ID!
            )
            continue
          }

          const whatsappConfig = config as { user_id: string; nombre: string | null }

          await supabase
            .from('whatsapp_messages_log')
            .update({ was_replied: true })
            .eq('user_id', whatsappConfig.user_id)
            .order('sent_at', { ascending: false })
            .limit(1)

          const selectedMonth = new Date().toISOString().slice(0, 7)
          const contextData   = await buildContextForUser(whatsappConfig.user_id, supabase, selectedMonth)

          const chatResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/chat`,
            {
              method:  'POST',
              headers: {
                'Content-Type':       'application/json',
                // Estos dos headers le dicen a /api/chat que la llamada
                // viene del backend interno y quién es el usuario.
                // /api/chat valida el secret antes de usarlos.
                'x-internal-user-id': whatsappConfig.user_id,
                'x-internal-secret':  process.env.INTERNAL_API_SECRET!,
              },
              body: JSON.stringify({
                message: text,
                context: {
                  ...contextData,
                  nombre_usuario: whatsappConfig.nombre ?? '',
                  canal: 'whatsapp',
                },
                history: [],
              }),
            }
          )

          if (!chatResponse.ok) {
            console.error('Error llamando a /api/chat desde webhook WhatsApp')
            continue
          }

          const chatData = await chatResponse.json()
          const respuesta = chatData.mensaje_respuesta as string | undefined

          if (respuesta) {
            await sendWhatsappReply(
              fromPhone,
              respuesta,
              process.env.META_WHATSAPP_TOKEN!,
              process.env.META_PHONE_NUMBER_ID!
            )

            await supabase.from('whatsapp_messages_log').insert({
              user_id:      whatsappConfig.user_id,
              trigger_type: 'user_reply',
              message_sent: respuesta,
            })
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('Error en webhook WhatsApp:', err)
    return NextResponse.json({ status: 'error_handled' })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendWhatsappReply(
  to:            string,
  message:       string,
  metaToken:     string,
  phoneNumberId: string
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    )
  } catch (err) {
    console.error('Error enviando reply WhatsApp:', err)
  }
}

interface OnboardingRow {
  ingreso_mensual: number
  objetivo_ahorro: number
}

interface TransactionRow {
  type:             string
  amount:           number
  category:         string
  transaction_date: string
}

interface BudgetRow {
  category:     string
  limit_amount: number
}

interface GoalRow {
  name:           string
  target_amount:  number
  current_amount: number
}

async function buildContextForUser(
  userId:        string,
  supabase:      SupabaseClient,
  selectedMonth: string
): Promise<Record<string, unknown>> {
  try {
    const [txRes, budgetsRes, goalsRes, onboardingRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('type, amount, category, transaction_date')
        .eq('user_id', userId),
      supabase
        .from('budgets')
        .select('category, limit_amount, month_period')
        .eq('user_id', userId)
        .eq('month_period', selectedMonth),
      supabase
        .from('goals')
        .select('name, target_amount, current_amount')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('is_completed', false),
      supabase
        .from('onboarding_profiles')
        .select('ingreso_mensual, objetivo_ahorro')
        .eq('user_id', userId)
        .single(),
    ])

    const transactions = (txRes.data ?? []) as TransactionRow[]
    const budgets      = (budgetsRes.data ?? []) as BudgetRow[]
    const goals        = (goalsRes.data ?? []) as GoalRow[]
    const onboarding   = onboardingRes.data as OnboardingRow | null

    const txMes = transactions.filter((t) =>
      t.transaction_date.startsWith(selectedMonth)
    )

    const totalGastado    = txMes.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amount, 0)
    const totalIngresado  = txMes.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0)
    const ingresoEfectivo = totalIngresado > 0 ? totalIngresado : (onboarding?.ingreso_mensual ?? 0)
    const objetivoAhorro  = onboarding?.objetivo_ahorro ?? 0
    const dineroLibre     = Math.max(0, ingresoEfectivo - totalGastado - objetivoAhorro)

    const hoy           = new Date()
    const ultimoDia     = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
    const diasRestantes = Math.max(1, ultimoDia - hoy.getDate())

    return {
      fecha_hoy:                hoy.toISOString().split('T')[0],
      mes_seleccionado:         selectedMonth,
      ingreso_mensual:          onboarding?.ingreso_mensual ?? 0,
      objetivo_ahorro:          objetivoAhorro,
      dinero_libre:             Math.round(dineroLibre),
      gasto_diario_recomendado: diasRestantes > 0 ? Math.round(dineroLibre / diasRestantes) : 0,
      dias_restantes:           diasRestantes,
      estado_mes:               dineroLibre > 0 ? 'bien' : 'mal',
      budgets: budgets.map((b) => ({
        categoria: b.category,
        limite:    b.limit_amount,
        gastado:   txMes
          .filter((t) => t.type === 'gasto' && t.category === b.category)
          .reduce((s, t) => s + t.amount, 0),
      })),
      goals: goals.map((g) => ({
        nombre:   g.name,
        objetivo: g.target_amount,
        actual:   g.current_amount,
      })),
    }
  } catch {
    return { fecha_hoy: new Date().toISOString().split('T')[0] }
  }
}

interface MetaWebhookPayload {
  object: string
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          from: string
          type: string
          text?: { body: string }
        }>
      }
    }>
  }>
}
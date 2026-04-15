// ========================================
// AI Wallet — next.config.js
//
// SEGURIDAD:
// - Security headers en todas las rutas
// - CSP estricta para el frontend
// - CORS explícito solo en el webhook de WhatsApp
// ========================================

/** @type {import('next').NextConfig} */
const nextConfig = {

  // ── Security headers — se aplican en TODAS las respuestas ─────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Evita que la app se incruste en iframes de otros dominios (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },

          // Evita que el browser "adivine" el content-type (MIME sniffing)
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Solo envía el origen en requests cross-origin (no la URL completa)
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Fuerza HTTPS por 2 años, incluye subdominios
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },

          // Deshabilita features que la app no usa
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },

          // Content Security Policy
          // - default-src 'self': solo recursos del mismo origen por defecto
          // - script-src: permite Next.js inline scripts (nonce sería más seguro pero requiere middleware)
          // - connect-src: Supabase y Groq (API calls)
          // - img-src: data URIs para avatares generados
          // - style-src 'unsafe-inline': requerido por Tailwind en runtime
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'} https://api.groq.com wss://*.supabase.co`,
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },

      // ── CORS solo para el webhook de WhatsApp ────────────────────────────
      // Meta llama a este endpoint desde sus servidores — necesita CORS explícito.
      // El resto de la API es same-origin (llamada desde el frontend propio).
      {
        source: '/api/whatsapp-webhook',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: 'https://graph.facebook.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Hub-Signature-256' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
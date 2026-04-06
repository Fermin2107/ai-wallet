import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value
        },
        set(name, value, options) {
          req.cookies.set({ name, value, ...options })
          res = NextResponse.next({
            request: { headers: req.headers },
          })
          res.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          req.cookies.set({ name, value: '', ...options })
          res = NextResponse.next({
            request: { headers: req.headers },
          })
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth', req.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

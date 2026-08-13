import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  // Тест/хөгжүүлэлтийн үед login шаардахгүй — sidebar-ын хэрэглэгч солигчоор дүр сольж ажиллана
  if (process.env.NEXT_PUBLIC_DEV_NO_AUTH === "true") {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() нь токеныг сэргээж, session-ийг хүчинтэй байлгана.
  // createServerClient болон getUser хооронд өөр код бүү оруул.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Нэвтрээгүй хэрэглэгчийг login хуудас руу чиглүүлнэ
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Дараах замуудаас бусад бүх хүсэлт дээр ажиллана:
     * - _next/static (статик файлууд)
     * - _next/image (зураг оновчлол)
     * - favicon.ico, зургийн файлууд
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

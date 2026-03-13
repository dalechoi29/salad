import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const supabaseResponse = await updateSession(request);

  const intlResponse = intlMiddleware(request);

  supabaseResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      intlResponse.headers.append(key, value);
    }
  });

  return intlResponse;
}

export const config = {
  matcher: ["/", "/(ko|en)/:path*"],
};

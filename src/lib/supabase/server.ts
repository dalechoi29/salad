import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url.startsWith("http");
}

export async function createClient() {
  const cookieStore = await cookies();

  if (!isSupabaseConfigured()) {
    return createMockClient();
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component where cookies
            // cannot be set. This can be safely ignored when the
            // middleware refreshes the session.
          }
        },
      },
      global: {
        fetch: (input, init) => {
          return fetch(input, { ...init, cache: "no-store" });
        },
      },
    }
  );
}

/**
 * Returns a mock client that returns empty results when Supabase
 * is not configured. This allows the app to render during development
 * before credentials are set up.
 */
function createMockClient() {
  const emptyResponse = { data: null, error: null };
  const emptyArrayResponse = { data: [], error: null };
  const emptySelect: Record<string, any> = {
    select: () => emptySelect,
    eq: () => emptySelect,
    neq: () => emptySelect,
    gt: () => emptySelect,
    gte: () => emptySelect,
    lt: () => emptySelect,
    lte: () => emptySelect,
    like: () => emptySelect,
    ilike: () => emptySelect,
    in: () => emptySelect,
    contains: () => emptySelect,
    filter: () => emptySelect,
    match: () => emptySelect,
    not: () => emptySelect,
    or: () => emptySelect,
    limit: () => emptySelect,
    range: () => emptySelect,
    single: () => Promise.resolve(emptyResponse),
    maybeSingle: () => Promise.resolve(emptyResponse),
    order: () => emptySelect,
    insert: () => Promise.resolve(emptyResponse),
    upsert: () => Promise.resolve(emptyResponse),
    update: () => emptySelect,
    delete: () => emptySelect,
    then: (resolve: (value: typeof emptyArrayResponse) => void) =>
      Promise.resolve(emptyArrayResponse).then(resolve),
  };

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signUp: () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () =>
        Promise.resolve({ data: { user: null }, error: { message: "Supabase not configured" } }),
      signOut: () => Promise.resolve({ error: null }),
      admin: {
        updateUserById: () =>
          Promise.resolve({ data: { user: null }, error: null }),
      },
    },
    from: () => emptySelect,
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  } as ReturnType<typeof createServerClient>;
}

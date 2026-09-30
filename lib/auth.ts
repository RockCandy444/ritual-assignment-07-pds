import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { authAccount, authSession, authUser, authVerification } from "@/db/schema";

function createAuth() {
  const runtime = env as unknown as Record<string, string | undefined>;
  const secret = runtime.BETTER_AUTH_SECRET;
  const baseURL = runtime.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new Error("Authentication configuration unavailable");
  return betterAuth({
    secret, baseURL,
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema: {
      user: authUser, session: authSession, account: authAccount, verification: authVerification,
    } }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    advanced: { database: { generateId: "uuid" }, useSecureCookies: baseURL.startsWith("https://") },
    rateLimit: { enabled: true, window: 60, max: 30 },
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }

export async function currentUser(requestHeaders: Headers) {
  const session = await getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
  return session?.user ?? null;
}

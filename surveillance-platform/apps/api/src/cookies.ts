import type { CookieSerializeOptions } from "@fastify/cookie";
import type { Env } from "./env.js";

export const SESSION_COOKIE_NAME = "surv_sess";

export function sessionCookieOptions(env: Env): CookieSerializeOptions {
  const opts: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
  };
  if (env.SESSION_COOKIE_DOMAIN) opts.domain = env.SESSION_COOKIE_DOMAIN;
  return opts;
}

export function clearSessionCookieOptions(env: Env): CookieSerializeOptions {
  const opts: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
  };
  if (env.SESSION_COOKIE_DOMAIN) opts.domain = env.SESSION_COOKIE_DOMAIN;
  return opts;
}

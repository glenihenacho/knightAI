import type { Env } from "../env.js";

export interface MagicLinkEmail {
  to: string;
  link: string;
}

export interface EmailTransport {
  sendMagicLink(input: MagicLinkEmail): Promise<void>;
}

export function createEmailTransport(
  env: Env,
  log: { info: (data: object | string, msg?: string) => void; error?: (data: object | string, msg?: string) => void },
): EmailTransport {
  if (!env.RESEND_API_KEY) {
    return {
      async sendMagicLink({ to, link }) {
        log.info({ to, link }, "magic link (dev console — no RESEND_API_KEY set)");
      },
    };
  }

  return {
    async sendMagicLink({ to, link }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL,
          to,
          subject: "Sign in to your surveillance dashboard",
          text: `Click to sign in:\n\n${link}\n\nThis link expires in 15 minutes.`,
          html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        log.error?.({ status: res.status, body }, "resend send failed");
        throw new Error(`resend send failed: ${res.status}`);
      }
    },
  };
}

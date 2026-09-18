// Raw MIME + send, shared by the feed digest and the ops reminders.
//
// `cloudflare:email` is imported lazily inside the send path on purpose. A
// static top-level import is evaluated when the module loads, so if the email
// binding is ever missing or misconfigured the whole Worker fails to start —
// taking /v1/rss, /v1/stocks and /v1/favicon down with it. Mail from here is a
// nice-to-have; it must not be able to break the endpoints the site depends on.
//
// .mjs for the same reason feed-health.mjs is: the repo has no
// "type": "module", so a .js extension makes plain-node imports warn.

export const MAIL_FROM = "digest@happening-now.net";

export const mailTo = env => env.ADMIN_EMAIL_ADDRESS || "hn-station@protonmail.com";

// Minimal RFC-5322 message. The send_email binding wants raw MIME, and pulling
// in a MIME library for one HTML part isn't worth it.
export function mime({ from, to, subject, html }) {
  return [
    `From: Happening Now <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
}

export async function sendHtmlMail(env, { subject, html }) {
  const to = mailTo(env);
  const { EmailMessage } = await import("cloudflare:email");
  await env.ADMIN_EMAIL.send(new EmailMessage(MAIL_FROM, to, mime({ from: MAIL_FROM, to, subject, html })));
  return to;
}

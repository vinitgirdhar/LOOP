import { env, features } from '../env.js';
import { logger } from './logger.js';

interface Mail {
  to: string;
  subject: string;
  html: string;
}

/**
 * Resend over plain fetch — no SDK needed for one POST.
 * Without RESEND_API_KEY the mail is logged so local signup still works.
 */
export async function sendMail({ to, subject, html }: Mail): Promise<void> {
  if (!features.email) {
    logger.info(`📧 [dev mail] to=${to} subject="${subject}"`);
    logger.info(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, html }),
    });
    if (!res.ok) logger.warn(`resend failed ${res.status}`, await res.text());
  } catch (error: unknown) {
    logger.error('resend threw', error instanceof Error ? error.message : error);
  }
}

const shell = (title: string, body: string, cta?: { label: string; url: string }) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 16px">Loop</p>
  <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">${body}</p>
  ${
    cta
      ? `<a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${cta.label}</a>
         <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;word-break:break-all">${cta.url}</p>`
      : ''
  }
</div>`;

export const mails = {
  verify: (link: string, otp: string) =>
    shell(
      'Confirm your email',
      `Use the code <strong style="font-size:18px;letter-spacing:3px">${otp}</strong> or click the button below. The link expires in 24 hours.`,
      { label: 'Verify email', url: link },
    ),
  reset: (link: string, otp: string) =>
    shell(
      'Reset your password',
      `Your one-time code is <strong style="font-size:18px;letter-spacing:3px">${otp}</strong>. It expires in 1 hour. Ignore this email if you did not ask for it.`,
      { label: 'Set a new password', url: link },
    ),
  invite: (workspace: string, inviter: string, link: string) =>
    shell(`${inviter} invited you to ${workspace}`, 'Join the workspace to see the board, docs and chat.', {
      label: 'Accept invite',
      url: link,
    }),
  digest: (workspace: string, body: string) => shell(`Daily digest — ${workspace}`, body),
};

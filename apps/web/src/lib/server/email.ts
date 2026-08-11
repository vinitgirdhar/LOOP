/**
 * Professional Email Service powered by Resend API.
 *
 * Dispatches HTML email templates with official LOOP logo, responsive design,
 * inline CSS for universal client compatibility, and fail-safe fallback logging.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEFAULT_FROM = process.env.EMAIL_FROM || 'LOOP <onboarding@resend.dev>';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Core dispatch function to Resend API.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY || RESEND_API_KEY;
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const from = options.from || DEFAULT_FROM;

  if (!apiKey || apiKey.trim() === '') {
    console.log(`[email:dev-fallback] To: ${recipients.join(', ')} | Subject: "${options.subject}"`);
    return { success: true, id: 'dev-fallback-id' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const payload = (await response.json()) as { id?: string; message?: string; name?: string };

    if (!response.ok) {
      console.error('[email:resend-error]', response.status, payload);
      return { success: false, error: payload.message || `Resend API returned ${response.status}` };
    }

    console.log(`[email:sent] ID: ${payload.id} | To: ${recipients.join(', ')}`);
    return { success: true, id: payload.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error dispatching email';
    console.error('[email:fetch-error]', message);
    return { success: false, error: message };
  }
}

/**
 * Renders the official LOOP email HTML layout frame.
 */
export function renderEmailTemplate({
  title,
  preheader,
  contentHtml,
  actionUrl,
  actionLabel,
}: {
  title: string;
  preheader?: string;
  contentHtml: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#18181b; -webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px; background-color:#ffffff; border-radius:20px; border:1px solid #e4e4e7; box-shadow:0 4px 20px rgba(0,0,0,0.05); overflow:hidden;">
          
          <!-- Header Bar with LOOP Logo -->
          <tr>
            <td style="background-color:#09090b; padding:28px 36px; text-align:left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:24px; font-weight:800; letter-spacing:-0.04em; color:#ffffff; font-family:sans-serif;">
                      LOOP<span style="color:#6366f1;">.</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.12em; color:#a1a1aa;">
                      Engineering Workspace
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding:36px; text-align:left; font-size:15px; line-height:1.6; color:#27272a;">
              <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; letter-spacing:-0.02em; color:#09090b;">
                ${escapeHtml(title)}
              </h1>
              ${contentHtml}

              ${
                actionUrl && actionLabel
                  ? `
              <div style="margin-top:32px; margin-bottom:12px; text-align:left;">
                <a href="${actionUrl}" target="_blank" style="display:inline-block; background-color:#09090b; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 28px; border-radius:9999px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                  ${escapeHtml(actionLabel)} &rarr;
                </a>
              </div>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px; background-color:#f4f4f5;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px; background-color:#fafafa; font-size:12px; line-height:1.5; color:#71717a; text-align:left;">
              <p style="margin:0 0 6px 0; font-weight:600; color:#3f3f46;">
                LOOP &bull; Enterprise Project Management Platform
              </p>
              <p style="margin:0;">
                Always current. Sent from Northwind Labs workspace.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m));
}

// ── CONCRETE DISPATCH HELPERS ───────────────────────────────────────────────

export async function sendWorkspaceInviteEmail({
  to,
  inviterName,
  workspaceName,
  role,
  inviteUrl,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
}): Promise<SendResult> {
  const title = `You've been invited to join ${workspaceName}`;
  const html = renderEmailTemplate({
    title,
    preheader: `${inviterName} invited you to collaborate on ${workspaceName} as a ${role}`,
    contentHtml: `
      <p style="margin:0 0 16px 0;">
        Hello! <strong>${escapeHtml(inviterName)}</strong> has invited you to join the <strong>${escapeHtml(
      workspaceName,
    )}</strong> team on LOOP as a <strong>${escapeHtml(role)}</strong>.
      </p>
      <p style="margin:0 0 16px 0; color:#52525b;">
        LOOP combines project planning, task tracking, sprint burndowns, interactive whiteboards, and real-time team chat into a single unified workspace.
      </p>
    `,
    actionUrl: inviteUrl,
    actionLabel: 'Accept Invitation & Join Team',
  });

  return sendEmail({ to, subject: `Invitation to join ${workspaceName} on LOOP`, html });
}

export async function sendTaskAssignedEmail({
  to,
  assigneeName,
  taskTitle,
  projectKey,
  taskNumber,
  taskUrl,
}: {
  to: string;
  assigneeName: string;
  taskTitle: string;
  projectKey: string;
  taskNumber: number;
  taskUrl: string;
}): Promise<SendResult> {
  const title = `Task Assigned: ${projectKey}-${taskNumber}`;
  const html = renderEmailTemplate({
    title,
    preheader: `You were assigned to "${taskTitle}"`,
    contentHtml: `
      <p style="margin:0 0 16px 0;">
        Hi <strong>${escapeHtml(assigneeName)}</strong>,
      </p>
      <p style="margin:0 0 16px 0;">
        You have been assigned to task <strong>${escapeHtml(projectKey)}-${taskNumber}</strong>:
      </p>
      <div style="background-color:#f4f4f5; border-left:4px solid #6366f1; padding:14px 18px; border-radius:8px; margin:0 0 20px 0; font-weight:600; color:#18181b;">
        ${escapeHtml(taskTitle)}
      </div>
    `,
    actionUrl: taskUrl,
    actionLabel: 'View Task Details',
  });

  return sendEmail({ to, subject: `[Assigned] ${projectKey}-${taskNumber}: ${taskTitle}`, html });
}

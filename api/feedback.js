/**
 * Digital Risk Radar — feedback endpoint
 * Deployed as a Vercel serverless function at /api/feedback
 *
 * Receives: POST { sector, score, comment, website }
 *   sector  — "Building Societies" | "Banks" | "Insurers"
 *   score   — 1–5 or null
 *   comment — string or ""
 *   website — honeypot, must be empty
 *
 * Sends an email to both addresses via Resend.
 * Requires env var RESEND_API_KEY (set in Vercel project settings).
 */

const TO = ['info@greendolphintccr.com', 'paul@greendolphintccr.com'];
const FROM = 'Digital Risk Radar <radar@greendolphintccr.com>';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sector, score, comment, website } = req.body || {};

  // Honeypot — real users leave this empty
  if (website) {
    return res.status(200).json({ ok: true });
  }

  // Nothing useful to send
  if (!score && !comment?.trim()) {
    return res.status(400).json({ error: 'Nothing to submit' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(200).json({ ok: true }); // don't break the user experience
  }

  const sectorLabel  = sector  || 'Unknown sector';
  const commentText  = comment?.trim() || null;
  const scoreDisplay = score ? `${score}/5 ${'●'.repeat(score)}${'○'.repeat(5 - score)}` : null;
  const subject      = `Radar feedback${sectorLabel ? ': ' + sectorLabel : ''}${score ? ' — ' + score + '/5' : ''}`;
  const timestamp    = new Date().toUTCString();

  const html = `
<table style="font-family:sans-serif;font-size:15px;color:#222;border-collapse:collapse;width:100%;max-width:520px">
  <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">Sector</td>
      <td style="padding:6px 0"><strong>${esc(sectorLabel)}</strong></td></tr>
  ${scoreDisplay ? `
  <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">Score</td>
      <td style="padding:6px 0">${esc(scoreDisplay)}</td></tr>` : ''}
  ${commentText ? `
  <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">Comment</td>
      <td style="padding:6px 0">${esc(commentText)}</td></tr>` : ''}
  <tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">Received</td>
      <td style="padding:6px 0;color:#888;font-size:13px">${timestamp}</td></tr>
</table>
<p style="margin-top:20px;font-size:12px;color:#aaa">
  Sent by the Digital Risk Radar anonymous feedback widget.
  No name, email or tracking was collected.
</p>`.trim();

  const text = [
    `Sector:  ${sectorLabel}`,
    scoreDisplay ? `Score:   ${scoreDisplay}` : null,
    commentText  ? `Comment: ${commentText}`  : null,
    `Received: ${timestamp}`,
    '',
    'Sent by the Digital Risk Radar anonymous feedback widget. No name, email or tracking was collected.',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: TO, subject, html, text }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Resend error', r.status, detail);
    }
  } catch (err) {
    console.error('Fetch error sending via Resend:', err);
  }

  // Always return 200 so the widget shows the thank-you message
  return res.status(200).json({ ok: true });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

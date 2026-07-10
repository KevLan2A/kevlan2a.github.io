#!/usr/bin/env node
/* =====================================================================
   NEWSLETTER MENSUELLE AUTOMATIQUE — Olivier Louette
   ---------------------------------------------------------------------
   Le 1er de chaque mois :
   1. Récupère les chantiers du mois écoulé dans posts.json
   2. Lit le mot personnel d'Olivier (newsletter/mot-olivier.md)
   3. Demande à Claude d'écrire l'objet + l'édito du mois
   4. Assemble un bel email HTML aux couleurs du site
   5. L'envoie à tous les abonnés via Brevo
   6. Archive une copie dans newsletter/archives/

   Secrets GitHub requis :
     ANTHROPIC_API_KEY   clé API Claude
     BREVO_API_KEY       clé API Brevo (app.brevo.com → SMTP & API)
     BREVO_LIST_ID       numéro de la liste d'abonnés Brevo (ex: 2)
     BREVO_SENDER_EMAIL  adresse expéditrice validée dans Brevo
===================================================================== */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const { ANTHROPIC_API_KEY, BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL } = process.env;
const ROOT = new URL('..', import.meta.url).pathname;

if (!ANTHROPIC_API_KEY || !BREVO_API_KEY || !BREVO_LIST_ID || !BREVO_SENDER_EMAIL) {
  console.error('❌ Secrets manquants : ANTHROPIC_API_KEY, BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL');
  process.exit(1);
}

/* ---------- 1. Les chantiers du mois écoulé ---------- */
const now = new Date();
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const moisCle = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`; // ex: 2026-06
const moisNom = prev.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });   // ex: juin 2026

let chantiers = [];
try {
  const { posts = [] } = JSON.parse(readFileSync(ROOT + 'posts.json', 'utf8'));
  chantiers = posts.filter(p => (p.date || '').startsWith(moisCle));
} catch { console.warn('⚠️  posts.json introuvable'); }

/* ---------- 2. Le mot d'Olivier (rédigé librement) ---------- */
let motOlivier = '';
try {
  const raw = readFileSync(ROOT + 'newsletter/mot-olivier.md', 'utf8');
  // On ignore les lignes de commentaire commençant par ">" et le contenu d'exemple
  motOlivier = raw.split('\n').filter(l => !l.trim().startsWith('>')).join('\n').trim();
  if (motOlivier.includes('(Écrivez ici')) motOlivier = '';
} catch { /* pas de mot ce mois-ci, section omise */ }

if (chantiers.length === 0 && !motOlivier) {
  console.log(`ℹ️  Rien à raconter pour ${moisNom} (aucun chantier, pas de mot d'Olivier) — pas d'envoi.`);
  process.exit(0);
}

/* ---------- 3. Claude écrit l'objet et l'édito ---------- */
async function editoClaude() {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content:
`Tu écris la newsletter mensuelle d'Olivier Louette, artisan menuisier d'art depuis 2002 dans le Fiumorbo, en Corse.

Mois concerné : ${moisNom}
Chantiers du mois (titres) : ${chantiers.map(c => c.title).join(' | ') || 'aucun chantier publié ce mois-ci'}

Écris en français, ton chaleureux et simple, sans hashtags ni emojis, sans inventer de détails.
Réponds UNIQUEMENT avec un objet JSON valide, sans backticks :
{"sujet": "objet d'email de 5 à 9 mots donnant envie d'ouvrir", "edito": "2 à 3 phrases d'introduction qui donnent le ton du mois"}`
      }]
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  const text = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

/* ---------- 4. Le gabarit HTML (palette du site) ---------- */
function esc(s = '') { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function nl2br(s = '') { return esc(s).replace(/\n/g, '<br>'); }

function buildHtml({ sujet, edito }) {
  const blocChantiers = chantiers.length ? `
    <h2 style="font-family:Georgia,serif;font-size:22px;color:#33251a;margin:34px 0 6px">Les chantiers de ${moisNom}</h2>
    ${chantiers.map(c => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#fffdf8;border:1px solid #e0d5c0;border-radius:12px">
      <tr>${c.image ? `<td width="130" style="padding:12px 0 12px 12px"><img src="${esc(c.image)}" width="118" height="88" alt="" style="border-radius:8px;object-fit:cover;display:block"></td>` : ''}
        <td style="padding:14px 16px;vertical-align:top">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a5f2e;font-weight:bold">${esc(c.date || '')}</p>
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:17px;color:#33251a"><b>${esc(c.title)}</b></p>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#5d4a3a">${esc(c.excerpt)}</p>
        </td></tr>
    </table>`).join('')}` : '';

  const blocMot = motOlivier ? `
    <h2 style="font-family:Georgia,serif;font-size:22px;color:#33251a;margin:34px 0 10px">Le mot d'Olivier</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-left:3px solid #b07f45;padding:4px 0 4px 16px;font-style:italic;font-size:15px;line-height:1.7;color:#5d4a3a">${nl2br(motOlivier)}</td>
    </tr></table>` : '';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(sujet)}</title></head>
<body style="margin:0;background:#f7f1e5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1e5"><tr><td align="center" style="padding:30px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td align="center" style="padding:0 0 24px">
    <p style="margin:0;font-family:Georgia,serif;font-size:26px;color:#33251a"><b>Olivier Louette</b></p>
    <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7663">Artisan menuisier — Fiumorbo, Corse</p>
  </td></tr>
  <tr><td style="background:#fffdf8;border:1px solid #e0d5c0;border-radius:16px;padding:32px 30px">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a5f2e;font-weight:bold">La lettre de l'atelier — ${moisNom}</p>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#5d4a3a">${esc(edito)}</p>
    ${blocChantiers}
    ${blocMot}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px auto 6px"><tr>
      <td style="background:#33251a;border-radius:10px"><a href="https://olivierlouette.com/index.html#devis" style="display:inline-block;padding:13px 26px;color:#f7f1e5;text-decoration:none;font-size:14px;font-weight:bold">Un projet ? Demandez votre devis gratuit</a></td>
    </tr></table>
  </td></tr>
  <tr><td align="center" style="padding:22px 10px;font-size:12px;color:#8a7663;line-height:1.7">
    Olivier Louette — Artisan menuisier · Fiumorbo, Corse · <a href="tel:+33601901490" style="color:#8a5f2e">06 01 90 14 90</a><br>
    Vous recevez cet email car vous vous êtes inscrit à la lettre de l'atelier.<br>
    <a href="{{ unsubscribe }}" style="color:#8a7663">Se désinscrire</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

/* ---------- 5. Envoi via Brevo ---------- */
async function sendBrevo(sujet, html) {
  const create = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Lettre de l'atelier — ${moisNom}`,
      subject: sujet,
      sender: { name: 'Olivier Louette — Menuisier', email: BREVO_SENDER_EMAIL },
      htmlContent: html,
      recipients: { listIds: [Number(BREVO_LIST_ID)] }
    })
  });
  if (!create.ok) throw new Error(`Brevo création : ${await create.text()}`);
  const { id } = await create.json();

  const send = await fetch(`https://api.brevo.com/v3/emailCampaigns/${id}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY }
  });
  if (!send.ok) throw new Error(`Brevo envoi : ${await send.text()}`);
  console.log(`📮 Newsletter "${sujet}" envoyée (campagne #${id})`);
}

/* ---------- Orchestration ---------- */
const { sujet, edito } = await editoClaude();
const html = buildHtml({ sujet, edito });

mkdirSync(ROOT + 'newsletter/archives', { recursive: true });
writeFileSync(`${ROOT}newsletter/archives/${moisCle}.html`, html);
console.log(`🗂  Archive : newsletter/archives/${moisCle}.html`);

await sendBrevo(sujet, html);

/* Remise à zéro du mot d'Olivier pour le mois suivant */
writeFileSync(ROOT + 'newsletter/mot-olivier.md',
`> ✍️ LE MOT D'OLIVIER — écrivez librement ci-dessous, tout ce qui n'est pas
> une ligne commençant par ">" partira tel quel dans la prochaine newsletter
> (envoyée le 1er du mois). Laissez le texte d'exemple pour ne rien publier.

(Écrivez ici votre mot du mois...)
`);
console.log('✅ Terminé — mot-olivier.md réinitialisé pour le mois prochain');

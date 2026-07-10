#!/usr/bin/env node
/* =====================================================================
   GÉNÉRATEUR AUTOMATIQUE DU JOURNAL — Olivier Louette
   ---------------------------------------------------------------------
   Instagram / Facebook  →  API Meta Graph  →  réécriture par Claude
   →  posts.json  →  affiché par realisations.html

   Variables d'environnement requises :
     ANTHROPIC_API_KEY   clé API Claude (console.anthropic.com)
     META_ACCESS_TOKEN   token longue durée Meta (developers.facebook.com)
     IG_USER_ID          identifiant du compte Instagram professionnel
       et/ou
     FB_PAGE_ID          identifiant de la page Facebook

   Usage :  node generate-posts.mjs
   (lancé automatiquement chaque jour par GitHub Actions, voir
    .github/workflows/journal.yml)
===================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const {
  ANTHROPIC_API_KEY,
  META_ACCESS_TOKEN,
  IG_USER_ID,
  FB_PAGE_ID
} = process.env;

const POSTS_FILE = new URL('../posts.json', import.meta.url).pathname;

if (!ANTHROPIC_API_KEY || !META_ACCESS_TOKEN || (!IG_USER_ID && !FB_PAGE_ID)) {
  console.error('❌ Variables manquantes : ANTHROPIC_API_KEY, META_ACCESS_TOKEN et IG_USER_ID ou FB_PAGE_ID');
  process.exit(1);
}

/* ---------- 1. Récupérer les publications récentes ---------- */
async function fetchInstagram() {
  if (!IG_USER_ID) return [];
  const url = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media` +
    `?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp` +
    `&limit=15&access_token=${META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) { console.error('Instagram:', await r.text()); return []; }
  const { data = [] } = await r.json();
  return data
    .filter(m => m.media_type !== 'VIDEO' || m.thumbnail_url)
    .map(m => ({
      id: `ig_${m.id}`,
      source: 'instagram',
      caption: m.caption || '',
      image: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      url: m.permalink,
      date: m.timestamp?.slice(0, 10)
    }));
}

async function fetchFacebook() {
  if (!FB_PAGE_ID) return [];
  const url = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/posts` +
    `?fields=id,message,permalink_url,created_time,full_picture` +
    `&limit=15&access_token=${META_ACCESS_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) { console.error('Facebook:', await r.text()); return []; }
  const { data = [] } = await r.json();
  return data
    .filter(p => p.message)
    .map(p => ({
      id: `fb_${p.id}`,
      source: 'facebook',
      caption: p.message,
      image: p.full_picture || '',
      url: p.permalink_url,
      date: p.created_time?.slice(0, 10)
    }));
}

/* ---------- 2. Réécrire chaque publication en article via Claude ---------- */
async function rewriteWithClaude(post) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content:
`Tu écris pour le site d'Olivier Louette, artisan menuisier d'art depuis 2002 dans le Fiumorbo, en Corse (escaliers, agencements, terrasses, créations uniques sur mesure).

Voici la légende d'une de ses publications ${post.source === 'facebook' ? 'Facebook' : 'Instagram'} :
"""
${post.caption.slice(0, 1500)}
"""

Transforme-la en court article de journal d'atelier, en français, ton chaleureux et artisanal, sans hashtags ni emojis, sans inventer de détails absents de la légende.

Si la légende mentionne une commune ou un lieu de Corse où se situe le chantier, indique la commune (orthographe officielle, ex : "Ghisonaccia", "Porto-Vecchio", "Prunelli-di-Fiumorbo"). Sinon mets null. N'invente jamais de lieu.

Réponds UNIQUEMENT avec un objet JSON valide, sans backticks ni texte autour :
{"title": "titre accrocheur de 4 à 9 mots", "excerpt": "article de 2 à 4 phrases", "commune": "nom de la commune ou null"}`
      }]
    })
  });
  if (!r.ok) throw new Error(`Claude API: ${await r.text()}`);
  const data = await r.json();
  const text = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

/* ---------- 3. Fusionner avec le journal existant ---------- */
const PAGE_FILE = new URL('../realisations.html', import.meta.url).pathname;

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Injecte les articles en HTML statique dans realisations.html
   (entre les marqueurs SEO_POSTS) pour que Google les indexe
   sans dépendre du JavaScript. Le JS de la page ré-affiche
   ensuite le même contenu, avec filtres et animations. */
function injectStaticPosts(posts) {
  let page;
  try { page = readFileSync(PAGE_FILE, 'utf8'); }
  catch { console.warn('⚠️  realisations.html introuvable, injection SEO ignorée'); return; }
  const START = '<!-- SEO_POSTS_START -->', END = '<!-- SEO_POSTS_END -->';
  if (!page.includes(START) || !page.includes(END)) {
    console.warn('⚠️  Marqueurs SEO absents de realisations.html, injection ignorée');
    return;
  }
  const html = posts.map(p => `
<article class="post visible">
  <div class="cover">${p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">` : '<div class="fallback"></div>'}<span class="src">${p.source === 'facebook' ? 'Facebook' : 'Instagram'}</span></div>
  <div class="body">
    <time datetime="${escapeHtml(p.date || '')}">${escapeHtml(p.date || '')}</time>
    <h2>${escapeHtml(p.title)}</h2>
    <p>${escapeHtml(p.excerpt)}</p>
    ${p.url ? `<a class="more" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Voir la publication →</a>` : ''}
  </div>
</article>`).join('\n');
  const before = page.slice(0, page.indexOf(START) + START.length);
  const after = page.slice(page.indexOf(END));
  writeFileSync(PAGE_FILE, before + '\n' + html + '\n' + after);
  console.log('🔎 Articles injectés en HTML statique (SEO)');
}

async function main() {
  const existing = existsSync(POSTS_FILE)
    ? JSON.parse(readFileSync(POSTS_FILE, 'utf8'))
    : { posts: [] };
  const known = new Set(existing.posts.map(p => p.id));

  const fresh = [...await fetchInstagram(), ...await fetchFacebook()]
    .filter(p => p.caption && !known.has(p.id));

  console.log(`📬 ${fresh.length} nouvelle(s) publication(s) à transformer`);

  for (const post of fresh) {
    try {
      const { title, excerpt, commune } = await rewriteWithClaude(post);
      existing.posts.push({ id: post.id, title, excerpt, date: post.date, source: post.source, image: post.image, url: post.url, commune: commune || null });
      console.log(`  ✅ ${title}`);
    } catch (e) {
      console.error(`  ⚠️  ${post.id} ignoré :`, e.message);
    }
  }

  existing.posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  existing.updated = new Date().toISOString();
  writeFileSync(POSTS_FILE, JSON.stringify(existing, null, 2));
  console.log(`💾 posts.json mis à jour (${existing.posts.length} articles au total)`);
  injectStaticPosts(existing.posts);
}

main().catch(e => { console.error(e); process.exit(1); });

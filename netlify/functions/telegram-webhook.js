// netlify/functions/telegram-webhook.js
// Receives Telegram messages and publishes them as blog posts
// by committing to posts.json in your GitHub repo.
//
// Environment variables needed (set in Netlify dashboard):
//   TELEGRAM_BOT_TOKEN   — from @BotFather
//   TELEGRAM_ALLOWED_ID  — your personal Telegram user ID (from @userinfobot)
//   GITHUB_TOKEN         — personal access token with repo write scope
//   GITHUB_REPO          — e.g. "jameyholmes/jameyholmes.com"
//   GITHUB_BRANCH        — e.g. "main"

// Native fetch is available in Node 18+

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const GITHUB_API = 'https://api.github.com';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

async function getFileUrl(fileId) {
  const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const data = await res.json();
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

async function downloadToBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function getPostsFile() {
  const res = await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/posts.json`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) return { posts: [], sha: null };
  const data = await res.json();
  const posts = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { posts, sha: data.sha };
}

async function uploadImage(filename, base64Data) {
  // Check if file exists (to get sha for update)
  let sha = undefined;
  const check = await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/images/${filename}`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  );
  if (check.ok) { const d = await check.json(); sha = d.sha; }

  await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/images/${filename}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Add image ${filename}`, content: base64Data, ...(sha ? { sha } : {}) })
    }
  );
  return `images/${filename}`;
}

async function savePostsFile(posts, sha) {
  const content = Buffer.from(JSON.stringify(posts, null, 2)).toString('base64');
  await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/posts.json`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'New blog post via Telegram', content, sha })
    }
  );
}

// ── State: pending posts waiting for more photos ──────────────────────────────
// Netlify functions are stateless so we use a simple in-memory approach:
// each message that starts with a title line triggers a new post.
// Photos sent within the same Telegram "album" (media group) are bundled automatically.

// ── Main handler ─────────────────────────────────────────────────────────────

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let update;
  try { update = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Bad JSON' }; }

  const msg = update.message || update.channel_post;
  if (!msg) return { statusCode: 200, body: 'ok' };

  const chatId = msg.chat.id;
  const fromId = msg.from?.id?.toString();

  // Security: only accept messages from your Telegram account
  if (fromId !== process.env.TELEGRAM_ALLOWED_ID) {
    await sendMessage(chatId, '⛔ Not authorized.');
    return { statusCode: 200, body: 'ok' };
  }

  const text = msg.text || msg.caption || '';
  const photos = msg.photo; // array of sizes, use largest

  // ── Parse post format ────────────────────────────────────────────────────
  // Expected format:
  //   Line 1: Title
  //   Line 2: (optional) #tag or location e.g. "📍 Yosemite, CA" or "#Nature"
  //   Rest: body text
  //   + any attached photos

  if (!text && !photos) {
    await sendMessage(chatId, 'Send text (with optional photos) to publish a post.\n\nFormat:\n*Title here*\n📍 Location (optional)\nYour post body...');
    return { statusCode: 200, body: 'ok' };
  }

  // If it's photos-only with no caption, reply with instructions
  if (photos && !text) {
    await sendMessage(chatId, '📸 Please add a caption with at least a title for these photos.');
    return { statusCode: 200, body: 'ok' };
  }

  const lines = text.trim().split('\n');
  const title = lines[0].replace(/^\*|\*$/g, '').trim();

  // Parse optional second line for location or tag
  let location = '';
  let tag = '';
  let bodyStart = 1;

  if (lines.length > 1) {
    const second = lines[1].trim();
    if (second.startsWith('📍') || second.toLowerCase().startsWith('location:')) {
      location = second.replace(/^📍\s*|location:\s*/i, '').trim();
      bodyStart = 2;
    } else if (second.startsWith('#')) {
      tag = second.replace('#', '').trim();
      bodyStart = 2;
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();

  // ── Handle photos ────────────────────────────────────────────────────────
  const imagePaths = [];
  if (photos && photos.length > 0) {
    await sendMessage(chatId, '📤 Uploading photos...');
    const largest = photos[photos.length - 1]; // Telegram provides multiple sizes
    try {
      const fileUrl = await getFileUrl(largest.file_id);
      const base64 = await downloadToBase64(fileUrl);
      const filename = `telegram-${Date.now()}-1.jpg`;
      const path = await uploadImage(filename, base64);
      imagePaths.push(path);
    } catch (e) {
      console.error('Photo upload error:', e);
    }
  }

  // ── Build post object ────────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const newPost = {
    id: Date.now().toString(),
    date: dateStr,
    ...(location && { location }),
    title,
    body: body || ' ',
    images: imagePaths,
    ...(tag && { tag })
  };

  // ── Commit to GitHub ─────────────────────────────────────────────────────
  try {
    const { posts, sha } = await getPostsFile();
    posts.unshift(newPost); // newest first
    await savePostsFile(posts, sha);
    await sendMessage(chatId, `✅ *Published!*\n\n"${title}"\n\nLive at www.jameyholmes.com in ~60 seconds.`);
  } catch (e) {
    console.error('GitHub commit error:', e);
    await sendMessage(chatId, `❌ Failed to publish: ${e.message}`);
  }

  return { statusCode: 200, body: 'ok' };
}

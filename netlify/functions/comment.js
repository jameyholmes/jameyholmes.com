// comment.js — saves a new comment to comments.json in GitHub
// POST body: { postId, name, message }

const GITHUB_API = 'https://api.github.com';

async function getCommentsFile() {
  const res = await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/comments.json`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) return { comments: {}, sha: null };
  const data = await res.json();
  const comments = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { comments, sha: data.sha };
}

async function saveCommentsFile(comments, sha) {
  const content = Buffer.from(JSON.stringify(comments, null, 2)).toString('base64');
  await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/comments.json`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'New comment', content, sha })
    }
  );
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { postId, name, message } = body;
  if (!postId || !name || !message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };

  // Basic sanitize
  const clean = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;').trim().slice(0, 500);

  const newComment = {
    id: Date.now().toString(),
    name: clean(name).slice(0, 50),
    message: clean(message),
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    approved: true
  };

  try {
    const { comments, sha } = await getCommentsFile();
    if (!comments[postId]) comments[postId] = [];
    comments[postId].push(newComment);
    await saveCommentsFile(comments, sha);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, comment: newComment }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
}

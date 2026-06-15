// comment.js — saves comments and likes to comments.json in GitHub
const GITHUB_API = 'https://api.github.com';

async function getFile() {
  const res = await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/comments.json`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) return { data: {}, sha: null };
  const file = await res.json();
  const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  return { data, sha: file.sha };
}

async function saveFile(data, sha) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  await fetch(
    `${GITHUB_API}/repos/${process.env.GITHUB_REPO}/contents/public/comments.json`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update comments/likes', content, sha })
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

  const { action, postId } = body;
  if (!postId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing postId' }) };

  const { data, sha } = await getFile();
  if (!data[postId]) data[postId] = { likes: 0, comments: [] };
  if (!data[postId].comments) data[postId].comments = [];
  if (!data[postId].likes) data[postId].likes = 0;

  if (action === 'like') {
    data[postId].likes += 1;
    try {
      await saveFile(data, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, likes: data[postId].likes }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (action === 'comment') {
    const { name, message } = body;
    if (!name || !message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
    const clean = s => s.replace(/</g,'&lt;').replace(/>/g,'&gt;').trim().slice(0, 500);
    const newComment = {
      id: Date.now().toString(),
      name: clean(name).slice(0, 50),
      message: clean(message),
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      approved: true
    };
    data[postId].comments.push(newComment);
    try {
      await saveFile(data, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, comment: newComment }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
}

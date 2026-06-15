// comment.js — handles comments AND likes using Netlify Blobs
// No GitHub commits = no redeploys triggered
// POST /api/comment  body: { action: 'comment', postId, name, message }
// POST /api/comment  body: { action: 'like', postId }

import { getStore } from "@netlify/blobs";

// Existing comments seeded from comments.json — runs once on first call if blob is empty
const SEED_DATA = {
  "1": { "likes": 1, "comments": [] },
  "1781020573367": { "likes": 7, "comments": [
    { "id": "1781144351208", "name": "Julia", "message": "Will I survive this trip? Only time will tell.", "date": "June 11, 2026", "approved": true },
    { "id": "1781215819738", "name": "Joseph Manna", "message": "You'll be fine. It's Jamey we gotta worry about. lol", "date": "June 11, 2026", "approved": true },
    { "id": "1781225986420", "name": "John Peters", "message": "Have fun!  Stay hydrated!  Eat lots of snacks!  Don't miss Randy's Donuts (right by LAX - glazed with pink frosting and sprinkles is my favorite)", "date": "June 12, 2026", "approved": true },
    { "id": "1781279022946", "name": "Grunckle Rob", "message": "Ambitious but sounds epic. Go USA!! Don't forget to hit the West Cosst Pokemon shops along the way!", "date": "June 12, 2026", "approved": true }
  ]},
  "1781280785072": { "likes": 5, "comments": [
    { "id": "1781285248452", "name": "Bhavi", "message": "Starting the way champs do!", "date": "June 12, 2026", "approved": true }
  ]},
  "1781302041831": { "likes": 3, "comments": [] },
  "1781312198460": { "likes": 4, "comments": [
    { "id": "1781312326386", "name": "Todd", "message": "Awesome! Enjoy!", "date": "June 13, 2026", "approved": true },
    { "id": "1781312516057", "name": "Jenny", "message": "Yay! Loving the live update. Enjoy.", "date": "June 13, 2026", "approved": true },
    { "id": "1781313312244", "name": "Mikel", "message": "We're watching in the plaza, we'll keep an eye out for you in the crowd", "date": "June 13, 2026", "approved": true },
    { "id": "1781315695616", "name": "Tim", "message": "You sandbagged it at 3-0", "date": "June 13, 2026", "approved": true },
    { "id": "1781316835771", "name": "Clint", "message": "I'm going to request that these posts have a time stamp to confirm these predictions.  Or are you a prophet?", "date": "June 13, 2026", "approved": true },
    { "id": "1781359699070", "name": "Casey", "message": "USA for the win!  Enjoy the games and time with family!!!!", "date": "June 13, 2026", "approved": true }
  ]},
  "1781327334470": { "likes": 8, "comments": [] },
  "1781367063171": { "likes": 2, "comments": [
    { "id": "1781378638164", "name": "Unkle Deezy", "message": "Be sure to leave some shampoo in your car to ward off the bears.", "date": "June 13, 2026", "approved": true }
  ]},
  "1781389150785": { "likes": 1, "comments": [
    { "id": "1781410979045", "name": "Ashish", "message": "Amaze!", "date": "June 14, 2026", "approved": true }
  ]}
};

async function getData(store) {
  try {
    const raw = await store.get('comments');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  // First run — seed with existing data
  await store.set('comments', JSON.stringify(SEED_DATA));
  return SEED_DATA;
}

async function saveData(store, data) {
  await store.set('comments', JSON.stringify(data));
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

  const store = getStore('worldcup');
  const data = await getData(store);

  if (!data[postId]) data[postId] = { likes: 0, comments: [] };
  if (!data[postId].comments) data[postId].comments = [];
  if (!data[postId].likes) data[postId].likes = 0;

  if (action === 'like') {
    data[postId].likes += 1;
    try {
      await saveData(store, data);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, likes: data[postId].likes }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (action === 'comment') {
    const { name, message } = body;
    if (!name || !message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name or message' }) };
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
      await saveData(store, data);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, comment: newComment }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
}

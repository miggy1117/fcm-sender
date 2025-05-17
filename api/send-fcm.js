const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load service account JSON from file
const serviceAccountPath = path.join(__dirname, 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Helper to get Google OAuth2 access token
async function getAccessToken() {
  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'],
    null
  );
  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

// Polyfill fetch for Node.js < 18
let fetchFunc;
if (typeof fetch === 'undefined') {
  fetchFunc = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
} else {
  fetchFunc = fetch;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Parse body (Vercel automatically parses JSON, but fallback for raw)
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.body);
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  }

  const { fcmToken, title, body: messageBody } = body;
  if (!fcmToken || !title || !messageBody) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const message = {
      message: {
        token: fcmToken,
        notification: { title, body: messageBody },
      },
    };

    const response = await fetchFunc(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data.error || data });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || err.toString() });
  }
};
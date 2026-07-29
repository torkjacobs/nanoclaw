#!/usr/bin/env node

/**
 * Google Search Console OAuth Helper
 *
 * One-time script to obtain GSC access and refresh tokens via OAuth 2.0.
 * Run: node scripts/gsc-oauth.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

function readEnv() {
  const content = fs.readFileSync(envPath, 'utf-8');
  const vars = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) vars[match[1]] = match[2].trim();
  }
  return vars;
}

function appendOrUpdateEnv(key, value) {
  let content = fs.readFileSync(envPath, 'utf-8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content);
}

const env = readEnv();
const CLIENT_ID = env.GSC_CLIENT_ID;
const CLIENT_SECRET = env.GSC_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GSC_CLIENT_ID or GSC_CLIENT_SECRET in .env');
  console.error('Add them to .env and re-run this script.');
  process.exit(1);
}

const PORT = 3457;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const AUTH_URL =
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Invalid callback — missing code.');
    return;
  }

  console.log('\nAuthorization code received. Exchanging for tokens...');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error(`Token exchange failed: ${tokenRes.status} ${errBody}`);
      res.writeHead(500);
      res.end('Token exchange failed. Check the console.');
      server.close();
      return;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    console.log(`\nAccess Token: ${accessToken}`);
    console.log(`Refresh Token: ${refreshToken}`);
    console.log(`Expires in: ${expiresIn} seconds (~${Math.round(expiresIn / 60)} minutes)`);

    // Save to .env
    appendOrUpdateEnv('GSC_ACCESS_TOKEN', accessToken);
    if (refreshToken) {
      appendOrUpdateEnv('GSC_REFRESH_TOKEN', refreshToken);
    }

    console.log('\nTokens saved to .env:');
    console.log(`GSC_ACCESS_TOKEN=${accessToken}`);
    if (refreshToken) console.log(`GSC_REFRESH_TOKEN=${refreshToken}`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>Google Search Console authorized!</h1><p>You can close this tab.</p></body></html>');
  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(500);
    res.end('Error during token exchange. Check the console.');
  }

  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log('Google Search Console OAuth Helper');
  console.log('==================================\n');
  console.log('Open this URL in your browser to authorize GSC:\n');
  console.log(AUTH_URL);
  console.log(`\nWaiting for callback on http://localhost:${PORT}/callback ...`);
});

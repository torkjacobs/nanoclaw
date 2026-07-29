#!/usr/bin/env node

/**
 * LinkedIn OAuth Helper
 *
 * One-time script to obtain a LinkedIn access token via OAuth 2.0.
 * Run: node scripts/linkedin-oauth.js
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

const env = readEnv();
const CLIENT_ID = env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = env.LINKEDIN_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_SECRET === 'MISSING') {
  console.error('Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET in .env');
  console.error('Add them to .env and re-run this script.');
  process.exit(1);
}

const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const AUTH_URL =
  `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent('openid profile w_member_social email')}` +
  `&state=nanoclaw`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (state !== 'nanoclaw' || !code) {
    res.writeHead(400);
    res.end('Invalid callback — missing code or bad state.');
    return;
  }

  console.log('\nAuthorization code received. Exchanging for access token...');

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
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
    const expiresIn = tokenData.expires_in;

    console.log(`\nAccess Token: ${accessToken}`);
    console.log(`Expires in: ${expiresIn} seconds (~${Math.round(expiresIn / 86400)} days)`);

    // Fetch profile to get person ID (sub)
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (profileRes.ok) {
      const profile = await profileRes.json();
      const sub = profile.sub;
      console.log(`\nYour LinkedIn Person ID (sub): ${sub}`);
      console.log(`\nAdd these to your .env:`);
      console.log(`LINKEDIN_ACCESS_TOKEN=${accessToken}`);
      console.log(`LINKEDIN_PERSON_ID=${sub}`);
    } else {
      console.log('\nCould not fetch profile. Add the token manually:');
      console.log(`LINKEDIN_ACCESS_TOKEN=${accessToken}`);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>LinkedIn authorized!</h1><p>You can close this tab.</p></body></html>');
  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(500);
    res.end('Error during token exchange. Check the console.');
  }

  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log('LinkedIn OAuth Helper');
  console.log('====================\n');
  console.log('Open this URL in your browser to authorize LinkedIn:\n');
  console.log(AUTH_URL);
  console.log(`\nWaiting for callback on http://localhost:${PORT}/callback ...`);
});

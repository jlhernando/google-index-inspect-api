import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import http from 'http';
import { authenticate } from '@google-cloud/local-auth';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const TOKEN_CACHE_PATH = resolve('.gsc-token-cache.json');
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
// ADC via gcloud uses cloud-platform scope (superset that covers Search Console)
const ADC_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Application Default Credentials (ADC).
 * Works if the user has run:
 *   gcloud auth application-default login
 */
export async function authenticateADC() {
  const auth = new GoogleAuth({ scopes: [ADC_SCOPE] });
  const client = await auth.getClient();
  // Verify it works before returning
  await client.getAccessToken();
  return {
    getAccessToken: async () => {
      const { token } = await client.getAccessToken();
      return token;
    },
  };
}

/**
 * Interactive OAuth 2.0 flow using @google-cloud/local-auth.
 * Caches refresh token to disk for reuse.
 */
export async function authenticateOAuth() {
  // Try to reuse cached refresh token
  if (existsSync(TOKEN_CACHE_PATH)) {
    try {
      const cached = JSON.parse(await readFile(TOKEN_CACHE_PATH, 'utf-8'));
      if (cached.refresh_token) {
        const secretData = JSON.parse(await readFile(resolve('client-secret.json'), 'utf-8'));
        const { client_id, client_secret } = secretData.web || secretData.installed;
        const client = new OAuth2Client(client_id, client_secret);
        client.setCredentials({ refresh_token: cached.refresh_token });
        // Verify the token works
        const { token } = await client.getAccessToken();
        if (token) {
          return {
            getAccessToken: async () => {
              const { token: t } = await client.getAccessToken();
              return t;
            },
          };
        }
      }
    } catch {
      // Cache invalid, proceed with interactive auth
    }
  }

  const auth = await authenticate({
    keyfilePath: resolve('client-secret.json'),
    scopes: [SCOPE],
  });

  // Cache the refresh token
  if (auth.credentials?.refresh_token) {
    await writeFile(
      TOKEN_CACHE_PATH,
      JSON.stringify({ refresh_token: auth.credentials.refresh_token }, null, 2),
      { mode: 0o600 }
    );
  }

  return {
    getAccessToken: async () => {
      if (isTokenExpired(auth.credentials)) {
        const { credentials } = await auth.refreshAccessToken();
        auth.credentials = credentials;
      }
      return auth.credentials.access_token;
    },
  };
}

/**
 * Service account authentication using a JSON key file.
 */
export async function authenticateServiceAccount(keyFilePath) {
  const auth = new GoogleAuth({
    keyFile: resolve(keyFilePath),
    scopes: [SCOPE],
  });
  const client = await auth.getClient();

  return {
    getAccessToken: async () => {
      const { token } = await client.getAccessToken();
      return token;
    },
  };
}


/**
 * Direct OAuth 2.0 flow using google-auth-library.
 * Starts a local HTTP server on port 3000, prints the auth URL,
 * and waits for the redirect callback.
 */
export async function authenticateDirectOAuth(credentialsFile = 'client-secret.json') {
  const secretData = JSON.parse(await readFile(resolve(credentialsFile), 'utf-8'));
  const creds = secretData.installed || secretData.web;
  const { client_id, client_secret } = creds;

  // Try cached token first
  if (existsSync(TOKEN_CACHE_PATH)) {
    try {
      const cached = JSON.parse(await readFile(TOKEN_CACHE_PATH, 'utf-8'));
      if (cached.refresh_token) {
        const client = new OAuth2Client(client_id, client_secret);
        client.setCredentials({ refresh_token: cached.refresh_token });
        const { token } = await client.getAccessToken();
        if (token) {
          return {
            getAccessToken: async () => {
              const { token: t } = await client.getAccessToken();
              return t;
            },
          };
        }
      }
    } catch {
      // Cache invalid, proceed with interactive auth
    }
  }

  // Start local server on a free port
  const server = http.createServer();
  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;

  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirectUri);

  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [SCOPE],
    prompt: 'consent',
  });

  console.log(`\nOpen this URL in your browser to authenticate:\n\n${authorizeUrl}\n`);
  console.log(`Waiting for authorization (listening on http://localhost:${port})...`);

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        const safeError = error.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication failed</h1><p>${safeError}</p>`);
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication successful!</h1><p>You can close this tab.</p>');
        resolve(authCode);
      }
    });

    setTimeout(() => reject(new Error('OAuth timed out after 120s')), 120000);
  });

  server.close();

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  // Cache the refresh token
  if (tokens.refresh_token) {
    await writeFile(
      TOKEN_CACHE_PATH,
      JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2),
      { mode: 0o600 }
    );
  }

  return {
    getAccessToken: async () => {
      const { token } = await oAuth2Client.getAccessToken();
      return token;
    },
  };
}

function isTokenExpired(credentials) {
  if (!credentials.expiry_date) return true;
  // Refresh 60s before expiry
  return Date.now() >= credentials.expiry_date - 60_000;
}

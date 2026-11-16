import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function reloadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const parsed = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const k = trimmed.slice(0, eq).trim();
        const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        parsed[k] = v;
        process.env[k] = v;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        try {
          reloadDotEnv();

          const urlObj = new URL(req.url, 'http://localhost');
          const pathname = urlObj.pathname;
          const query = Object.fromEntries(urlObj.searchParams.entries());

          let handlerPath = null;
          if (pathname === '/api/customers') {
            handlerPath = path.resolve(process.cwd(), 'api/customers/index.js');
          } else if (pathname.startsWith('/api/customers/')) {
            query.id = pathname.slice('/api/customers/'.length);
            handlerPath = path.resolve(process.cwd(), 'api/customers/[id].js');
          } else if (pathname === '/api/auth/google') {
            handlerPath = path.resolve(process.cwd(), 'api/auth/google.js');
          } else if (pathname === '/api/auth/refresh') {
            handlerPath = path.resolve(process.cwd(), 'api/auth/refresh.js');
          } else if (pathname === '/api/auth/logout') {
            handlerPath = path.resolve(process.cwd(), 'api/auth/logout.js');
          } else if (pathname === '/api/users') {
            handlerPath = path.resolve(process.cwd(), 'api/users/index.js');
          }

          if (!handlerPath) return next();

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString('utf8');
          req.body = rawBody ? JSON.parse(rawBody) : {};
          req.query = query;

          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.end(JSON.stringify(data));
          };

          const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`);
          await mod.default(req, res);
        } catch (err) {
          console.error('Dev API error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
        }
      });
    },
  };
}

export default defineConfig(() => {
  reloadDotEnv();
  return {
    plugins: [react(), vercelApiDevPlugin()],
  };
});

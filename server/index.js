import { createServer } from 'node:http';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.DATABASE_PATH ?? resolve(root, 'data', 'accounts.sqlite');
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });

const { app, close } = createApp({ databasePath });
const server = createServer(app);
let vite;

if (process.env.NODE_ENV === 'production') {
  const { default: express } = await import('express');
  const expressApp = app;
  
  // Serve static files from dist
  expressApp.use(express.static(resolve(root, 'dist')));
  
  // Android app download endpoint
  expressApp.get('/download/android-app', (_request, response, next) => {
    const apkPath = resolve(root, 'dist', 'ascend-capital.apk');
    
    // Check if APK exists
    if (!existsSync(apkPath)) {
      return response.status(404).json({ 
        error: 'Android app is not available for download yet. Please try again later.' 
      });
    }
    
    response.download(apkPath, 'ascend-capital-app.apk', (error) => {
      if (error && !response.headersSent) next(error);
    });
  });
  
  // iOS app download endpoint (future)
  expressApp.get('/download/ios-app', (_request, response) => {
    response.status(501).json({ 
      error: 'iOS app is not yet available. Check back soon.' 
    });
  });
  
  // App download info endpoint
  expressApp.get('/api/app-downloads', (_request, response) => {
    const androidAvailable = existsSync(resolve(root, 'dist', 'ascend-capital.apk'));
    const iosAvailable = existsSync(resolve(root, 'dist', 'ascend-capital.ipa'));
    
    return response.json({
      android: {
        available: androidAvailable,
        url: androidAvailable ? '/download/android-app' : null,
        version: process.env.APP_VERSION ?? '1.0.0',
        buildDate: new Date().toISOString(),
      },
      ios: {
        available: iosAvailable,
        url: iosAvailable ? '/download/ios-app' : null,
        version: process.env.APP_VERSION ?? '1.0.0',
      }
    });
  });
  
  // SPA routing - handle all other requests
  expressApp.get(/.*/, (_request, response) => response.sendFile(resolve(root, 'dist', 'index.html')));
} else {
  // Development: support project download for local development
  app.get('/download/project', (_request, response, next) => {
    response.download(resolve(root, 'ascend-capital-project.zip'), 'ascend-capital-project.zip', (error) => {
      if (error && !response.headersSent) next(error);
    });
  });
  
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => {
  console.log(`Ascend Capital ${process.env.NODE_ENV === 'production' ? 'server' : 'development server'} listening on ${host}:${port}`);
});

async function shutdown() {
  server.close();
  await vite?.close();
  close();
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

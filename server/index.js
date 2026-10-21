import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let app, close, server;

try {
  console.log('🚀 Initializing Ascend Capital app...');
  const result = await createApp();
  app = result.app;
  close = result.close;
  console.log('✅ App initialized successfully');

  server = createServer(app);
} catch (error) {
  console.error('❌ FATAL: Failed to initialize app:', error.message);
  console.error(error);
  process.exit(1);
}

let vite;

if (process.env.NODE_ENV === 'production') {
  const { default: express } = await import('express');

  // Serve static files from dist
  app.use(express.static(resolve(root, 'dist')));

  // Android app download endpoint
  app.get('/download/android-app', (_request, response, next) => {
    const apkPath = resolve(root, 'dist', 'ascend-capital.apk');

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
  app.get('/download/ios-app', (_request, response) => {
    response.status(501).json({ 
      error: 'iOS app is not yet available. Check back soon.' 
    });
  });

  // App download info endpoint
  app.get('/api/app-downloads', (_request, response) => {
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

  // SPA routing fallback - MUST come AFTER all other routes
  app.use((_request, response, next) => {
    if (_request.path.startsWith('/api') || _request.path.startsWith('/download')) {
      return next();
    }
    response.sendFile(resolve(root, 'dist', 'index.html'));
  });
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
  console.log(✅ Ascend Capital ${process.env.NODE_ENV === 'production' ? 'server' : 'dev server'} listening on ${host}:${port});
});

async function shutdown() {
  console.log('⚠️  Shutting down gracefully...');
  server.close();
  await vite?.close();
  await close();
  console.log('✅ Server closed');
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
}); 

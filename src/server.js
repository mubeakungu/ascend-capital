import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from './app.js';  // ← Import your main app with API routes

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

// Create the main app with all API routes
const { app: mainApp, close } = createApp({ 
  databasePath: process.env.DATABASE_PATH || join(__dirname, 'data', 'accounts.sqlite')
});

// Serve static files from dist
mainApp.use(express.static(join(__dirname, 'dist')));

// SPA fallback - MUST be LAST and MUST check for API routes
mainApp.get('*', (req, res) => {
  // Don't serve HTML for API requests
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  
  // Serve index.html for all other routes (SPA routing)
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

mainApp.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📝 API routes registered from app.js`);
  console.log(`🌐 SPA fallback enabled for client-side routing`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  close();
  process.exit(0);
});

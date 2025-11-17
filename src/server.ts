import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * API endpoints
 */

// Configuration endpoint that serves environment variables
app.get('/api/config', (req, res) => {
  const config = {
    production: process.env['NODE_ENV'] === 'production',
    opencageApiKey: process.env['OPENCAGE_API_KEY'] || '', // dev settings
    apiBaseUrl: process.env['API_BASE_URL'] || '',
    mapTileUrl: process.env['MAP_TILE_URL'] || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    appVersion: process.env['APP_VERSION'] || '1.0.0',
    appName: process.env['APP_NAME'] || 'Fervo Weather',
  };

  res.json(config);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    // console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

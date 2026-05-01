import express from 'express';
import { errorHandler } from './middlewares/errorHandler';
import { livenessProbe, readinessProbe } from './modules/health/health.controller';

// Route imports
import postsRoutes    from './routes/v1/posts.routes';
import hashtagsRoutes from './routes/v1/hashtags.routes';
import platformsRoutes from './routes/v1/platforms.routes';
import scraperRoutes  from './routes/v1/scraper.routes';
import adminRoutes    from './routes/v1/admin.routes';

const app = express();

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health (no auth) ──────────────────────────────────────────────────────────
app.get('/health', livenessProbe);
app.get('/api/v1/health', readinessProbe);

// ── API v1 routes ─────────────────────────────────────────────────────────────
app.use('/api/v1/posts',     postsRoutes);
app.use('/api/v1/hashtags',  hashtagsRoutes);
app.use('/api/v1/platforms', platformsRoutes);
app.use('/api/v1/scraper',   scraperRoutes);
app.use('/api/v1/admin',     adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Central error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

export default app;

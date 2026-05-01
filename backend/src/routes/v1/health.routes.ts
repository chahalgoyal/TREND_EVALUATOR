import { Router } from 'express';
import { livenessProbe, readinessProbe } from '../../modules/health/health.controller';

const router = Router();

// GET /health — lightweight liveness (no auth needed)
router.get('/', livenessProbe);

// GET /api/v1/health — deep readiness check
router.get('/deep', readinessProbe);

export default router;

import { Router } from 'express';
import { requireApiKey } from '../../middlewares/apiKeyAuth';
import { getPlatforms, getPlatformBySlug } from '../../modules/platforms/platform.controller';

const router = Router();

router.use(requireApiKey);

// GET /api/v1/platforms
router.get('/', getPlatforms);

// GET /api/v1/platforms/:slug
router.get('/:slug', getPlatformBySlug);

export default router;

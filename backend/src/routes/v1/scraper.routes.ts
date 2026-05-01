import { Router } from 'express';
import { requireApiKey, requireAdmin } from '../../middlewares/apiKeyAuth';
import { triggerScraper, getScrapeJobs, getScrapeJobById } from '../../modules/scraper/scraper.controller';

const router = Router();

router.use(requireApiKey);

// POST /api/v1/scraper/run  — admin only
router.post('/run', requireAdmin, triggerScraper);

// GET /api/v1/scraper/jobs
router.get('/jobs', getScrapeJobs);

// GET /api/v1/scraper/jobs/:jobId
router.get('/jobs/:jobId', getScrapeJobById);

export default router;

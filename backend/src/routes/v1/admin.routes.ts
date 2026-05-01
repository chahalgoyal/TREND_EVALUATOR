import { Router } from 'express';
import { requireApiKey, requireAdmin } from '../../middlewares/apiKeyAuth';
import {
  getThresholdRules,
  createThresholdRule,
  updateThresholdRule,
  deleteThresholdRule,
  createPlatform,
  updatePlatform,
} from '../../modules/threshold/threshold.controller';

const router = Router();

// All admin routes require admin key
router.use(requireApiKey, requireAdmin);

// Threshold rules CRUD
router.get('/threshold-rules', getThresholdRules);
router.post('/threshold-rules', createThresholdRule);
router.patch('/threshold-rules/:id', updateThresholdRule);
router.delete('/threshold-rules/:id', deleteThresholdRule);

// Platform admin
router.post('/platforms', createPlatform);
router.patch('/platforms/:slug', updatePlatform);

export default router;

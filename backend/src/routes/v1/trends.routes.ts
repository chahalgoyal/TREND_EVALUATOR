import { Router } from 'express';
import {
  getTrendingPosts,
  getBreakoutHashtags,
  getTopHashtags,
  getHashtagHistory
} from '../../modules/trends/trends.controller';

const router = Router();

// Publicly accessible endpoints for the dashboard
router.get('/posts', getTrendingPosts);
router.get('/hashtags/breakouts', getBreakoutHashtags);
router.get('/hashtags/top', getTopHashtags);
router.get('/hashtags/:tag/history', getHashtagHistory);

export default router;

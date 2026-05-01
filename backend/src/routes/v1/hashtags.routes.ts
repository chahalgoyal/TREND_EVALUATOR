import { Router } from 'express';
import { requireApiKey } from '../../middlewares/apiKeyAuth';
import {
  getHashtags,
  getHashtagByTag,
  getHashtagPosts,
} from '../../modules/hashtags/hashtag.controller';

const router = Router();

router.use(requireApiKey);

// GET /api/v1/hashtags
router.get('/', getHashtags);

// GET /api/v1/hashtags/:tag
router.get('/:tag', getHashtagByTag);

// GET /api/v1/hashtags/:tag/posts
router.get('/:tag/posts', getHashtagPosts);

export default router;

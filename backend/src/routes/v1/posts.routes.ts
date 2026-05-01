import { Router } from 'express';
import { requireApiKey } from '../../middlewares/apiKeyAuth';
import { getPosts, getPostById, deletePost } from '../../modules/posts/post.controller';

const router = Router();

router.use(requireApiKey);

// GET /api/v1/posts
router.get('/', getPosts);

// GET /api/v1/posts/:id
router.get('/:id', getPostById);

// DELETE /api/v1/posts/:id  (admin only — handled inside controller)
router.delete('/:id', deletePost);

export default router;

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js'; // ADJUST names to match your auth.js exports
import {
  listActiveCategories,
  listAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';

const router = Router();

// Any logged-in user (used by the listing form later)
router.get('/', requireAuth, listActiveCategories);

// Admin only
router.get('/all', requireAuth, requireAdmin, listAllCategories);
router.post('/', requireAuth, requireAdmin, createCategory);
router.patch('/:id', requireAuth, requireAdmin, updateCategory);
router.delete('/:id', requireAuth, requireAdmin, deleteCategory);

export default router;
import express from 'express';
import { getMyContributions, markContributionPaid } from '../controllers/contributionController.js';
import { authMiddleware, requireGroupMember } from '../middleware/auth.js';

const router = express.Router();

router.get('/groups/:groupId/contributions', authMiddleware, requireGroupMember('groupId'), getMyContributions);

router.post('/contributions/:contributionId/pay', authMiddleware, markContributionPaid);

export default router;
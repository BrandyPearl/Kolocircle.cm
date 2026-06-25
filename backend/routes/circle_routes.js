import express from 'express';
import {
  createGroup,
  listPublicGroups,
  getGroupDetails,
  requestToJoin,
  addMemberDirectly,
  respondToJoinRequest,
  requestToLeave,
  startCycle
} from '../controllers/circleController.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireVerified,
  requireCircleAdmin,
  requireGroupMember
} from '../middleware/auth.js';

const router = express.Router();

router.get('/public', listPublicGroups);

router.get('/:groupId', optionalAuthMiddleware, getGroupDetails);

router.post('/', authMiddleware, requireVerified, createGroup);

router.post('/:groupId/join', authMiddleware, requireVerified, requestToJoin);
router.post('/:groupId/members', authMiddleware, requireCircleAdmin('groupId'), addMemberDirectly);

router.patch('/:groupId/members/:membershipId', authMiddleware, requireCircleAdmin('groupId'), respondToJoinRequest);
router.post('/:groupId/leave', authMiddleware, requireGroupMember('groupId'), requestToLeave);
router.post('/:groupId/cycles/start', authMiddleware, requireCircleAdmin('groupId'), startCycle);

export default router;
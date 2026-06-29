import express from 'express';
import {
  getWalletOverview,
  getWeeklyActivity,
  initiateTopup,
  checkTopupStatus,
  initiateWithdrawal
} from '../controllers/walletController.js';
import { authMiddleware, requireVerified } from '../middleware/auth.js';

const router = express.Router();

router.get('/overview', authMiddleware, getWalletOverview);
router.get('/weekly-activity', authMiddleware, getWeeklyActivity);

router.post('/topup', authMiddleware, requireVerified, initiateTopup);
router.get('/topup/status/:referenceId', authMiddleware, checkTopupStatus);

router.post('/withdraw', authMiddleware, requireVerified, initiateWithdrawal);

export default router;
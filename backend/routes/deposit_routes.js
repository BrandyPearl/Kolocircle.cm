import express from 'express';
import { 
  initiateDeposit, 
  checkDepositStatus, 
  handleMoMoCallback 
} from '../controllers/depositController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/initiate', authMiddleware, initiateDeposit);

router.get('/status/:referenceId', authMiddleware, checkDepositStatus);

router.post('/webhook', handleMoMoCallback);

export default router;
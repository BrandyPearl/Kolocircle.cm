import express from 'express';
import { 
  requestGuarantor, 
  confirmGuarantor, 
  declineGuarantor, 
  checkGuarantorChangeEligibility, 
  changeGuarantor 
} from '../controllers/guarantorController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/request', authMiddleware, requestGuarantor);

router.get('/confirm/:token', confirmGuarantor);

router.get('/decline/:token', declineGuarantor);

router.get('/change-eligible', authMiddleware, checkGuarantorChangeEligibility);

router.post('/change', authMiddleware, changeGuarantor);

export default router;
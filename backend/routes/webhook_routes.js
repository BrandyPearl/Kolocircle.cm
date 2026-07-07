import express from 'express';
import { handleFapshiWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/fapshi', handleFapshiWebhook);

export default router;
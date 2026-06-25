import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { 
  sendOTPCode, 
  verifyOTPCode, 
  submitPersonalDetails, 
  finalSubmission, 
  getVerificationStatus 
} from '../controllers/verificationController.js';
import { authMiddleware } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${req.userId}_${file.fieldname}_${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/otp/send', sendOTPCode);

router.post('/otp/verify', verifyOTPCode);

router.post('/personal-details', authMiddleware, submitPersonalDetails);

router.post(
  '/upload-documents',
  authMiddleware,
  upload.fields([
    { name: 'cni_front', maxCount: 1 },
    { name: 'cni_back', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const userId = req.userId;

      if (!req.files || !req.files.cni_front || !req.files.cni_back || !req.files.selfie) {
        return res.status(400).json({ error: 'All three documents are required' });
      }

      const docsToInsert = [
        { docType: 'cni_front', file: req.files.cni_front[0] },
        { docType: 'cni_back', file: req.files.cni_back[0] },
        { docType: 'selfie', file: req.files.selfie[0] }
      ];

      for (const doc of docsToInsert) {
        const filePath = `/uploads/${doc.file.filename}`;
        await pool.query(
          'INSERT INTO verification_documents (user_id, doc_type, file_path) VALUES (?, ?, ?)',
          [userId, doc.docType, filePath]
        );
      }

      res.json({
        message: 'Documents uploaded successfully',
        documents: docsToInsert.map(d => ({ type: d.docType, uploaded: true }))
      });
    } catch (error) {
      console.error('Error uploading documents:', error);
      res.status(500).json({ error: 'Failed to upload documents' });
    }
  }
);

router.post('/submit', authMiddleware, finalSubmission);

router.get('/status', authMiddleware, getVerificationStatus);

export default router;
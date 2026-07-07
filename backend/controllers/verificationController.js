import pool from '../config/db.js';
import { sendOTP, sendVerificationStatusUpdate } from '../utils/sms.js';
import { generateToken } from '../middleware/auth.js';

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const normalizePhone = (raw) => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // strip leading country code (e.g., 237)
  if (digits.startsWith('237')) return digits.slice(3);
  return digits;
};

export const sendOTPCode = async (req, res) => {
  try {
    const { phone: rawPhone, operator } = req.body;

    if (!rawPhone) return res.status(400).json({ error: 'Phone is required' });

    const phone = normalizePhone(rawPhone);

    // basic 9-digit validation (Cameroon numbers)
    if (!/^\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone format. Use 9 digits (e.g. 6XXXXXXXX)' });
    }

    // find or create user
    const [userRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    let userId;
    if (!userRows.length) {
      const [createRes] = await pool.query('INSERT INTO users (phone) VALUES (?)', [phone]);
      userId = createRes.insertId;
    } else {
      userId = userRows[0].id;
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (user_id, phone, code, expires_at) VALUES (?, ?, ?, ?)',
      [userId, phone, code, expiresAt]
    );

    // send SMS (currently logs; replace with real provider keys in .env)
    await sendOTP(phone, code);

    return res.json({ message: 'OTP sent successfully', phone: phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
};

export const verifyOTPCode = async (req, res) => {
  try {
    const { phone: rawPhone, code } = req.body;

    if (!rawPhone || !code) return res.status(400).json({ error: 'Phone and code are required' });

    const phone = normalizePhone(rawPhone);
    if (!/^\d{9}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone format' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid OTP format. Must be 6 digits' });

    const [userRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const userId = userRows[0].id;

    const [otpRows] = await pool.query(
      'SELECT id FROM otp_codes WHERE user_id = ? AND code = ? AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [userId, code]
    );

    if (!otpRows.length) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const otpId = otpRows[0].id;
    await pool.query('UPDATE otp_codes SET used = true WHERE id = ?', [otpId]);
    await pool.query('UPDATE users SET phone_verified = true WHERE id = ?', [userId]);

    const token = generateToken(userId);

    return res.json({ message: 'Phone verified successfully', token, userId });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

export const submitPersonalDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { fullName, dateOfBirth, gender, cniNumber, region } = req.body;

    if (!fullName || !dateOfBirth || !gender || !cniNumber || !region) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const dobDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
      if (age - 1 < 18) {
        return res.status(400).json({ error: 'You must be at least 18 years old' });
      }
    } else if (age < 18) {
      return res.status(400).json({ error: 'You must be at least 18 years old' });
    }

    const validRegions = ['Adamawa', 'Centre', 'East', 'Far North', 'Littoral', 'North', 'North West', 'South', 'South West', 'West'];
    if (!validRegions.includes(region)) {
      return res.status(400).json({ error: 'Invalid region' });
    }

    const cniCheck = await pool.query('SELECT id FROM users WHERE cni_number = $1 AND id != $2', [cniNumber, userId]);
    if (cniCheck.rows.length > 0) {
      return res.status(400).json({ error: 'CNI number already registered' });
    }

    await pool.query(
      'UPDATE users SET full_name = $1, date_of_birth = $2, gender = $3, cni_number = $4, region = $5 WHERE id = $6',
      [fullName, dateOfBirth, gender, cniNumber, region, userId]
    );

    res.json({ message: 'Personal details saved successfully' });
  } catch (error) {
    console.error('Error submitting personal details:', error);
    res.status(500).json({ error: 'Failed to save personal details' });
  }
};

export const finalSubmission = async (req, res) => {
  try {
    const userId = req.userId;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.phone_verified || !user.full_name || !user.cni_number) {
      return res.status(400).json({ error: 'Incomplete personal information' });
    }

    const docsResult = await pool.query(
      'SELECT COUNT(*) as count FROM verification_documents WHERE user_id = $1',
      [userId]
    );

    if (parseInt(docsResult.rows[0].count) < 3) {
      return res.status(400).json({ error: 'All 3 documents must be uploaded' });
    }

    const guarantorResult = await pool.query(
      'SELECT * FROM guarantors WHERE member_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
      [userId, 'confirmed']
    );

    if (guarantorResult.rows.length === 0) {
      return res.status(400).json({ error: 'Guarantor confirmation is required' });
    }

    const depositResult = await pool.query(
      'SELECT * FROM deposits WHERE user_id = $1 AND status = $2',
      [userId, 'successful']
    );

    if (depositResult.rows.length === 0) {
      return res.status(400).json({ error: 'Security deposit payment is required' });
    }

    await pool.query(
      'INSERT INTO verification_submissions (user_id, ip_address, user_agent, review_status) VALUES ($1, $2, $3, $4)',
      [userId, ipAddress, userAgent, 'pending_review']
    );

    await pool.query(
      'UPDATE users SET verification_status = $1, trust_score = 20 WHERE id = $2',
      ['pending_review', userId]
    );

    res.json({
      message: 'Verification submitted successfully',
      status: 'pending_review',
      note: 'Review takes 1–2 business days. You will be notified by SMS.'
    });
  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
};

export const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const userResult = await pool.query(
      'SELECT verification_status, trust_score FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      status: userResult.rows[0].verification_status,
      trustScore: userResult.rows[0].trust_score
    });
  } catch (error) {
    console.error('Error getting verification status:', error);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
};

export default {
  sendOTPCode,
  verifyOTPCode,
  submitPersonalDetails,
  finalSubmission,
  getVerificationStatus
};

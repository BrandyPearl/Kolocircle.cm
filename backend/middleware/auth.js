import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = decoded; // { userId, role }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.user = decoded;
    } catch (error) {
      console.log('Invalid optional token:', error.message);
    }
  }

  next();
};


export const generateToken = (userId, role, expiresIn = '7d') => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn });
};

export const requirePlatformAdmin = (req, res, next) => {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Forbidden: platform admin access required' });
  }
  next();
};

export const requireCircleAdmin = (groupIdParam = 'groupId') => {
  return async (req, res, next) => {
    try {
      const groupId = req.params[groupIdParam];
      const [rows] = await pool.query(
        `SELECT id, creator_id, group_status, max_members, visibility
         FROM njangi_groups WHERE id = ?`,
        [groupId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const group = rows[0];
      if (group.creator_id !== req.userId) {
        return res.status(403).json({ error: 'Forbidden: only this circle\'s admin may perform this action' });
      }

      req.group = group;
      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};


export const requireGroupMember = (groupIdParam = 'groupId') => {
  return async (req, res, next) => {
    try {
      const groupId = req.params[groupIdParam];
      const [rows] = await pool.query(
        `SELECT id, group_id, user_id, member_status
         FROM group_members
         WHERE group_id = ? AND user_id = ? AND request_status = 'approved'`,
        [groupId, req.userId]
      );

      if (!rows.length || rows[0].member_status !== 'active') {
        return res.status(403).json({ error: 'Forbidden: you are not an active member of this circle' });
      }

      req.membership = rows[0];
      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};


export const requireVerified = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT verification_status FROM users WHERE id = ?`,
      [req.userId]
    );

    if (!rows.length || rows[0].verification_status !== 'verified') {
      return res.status(403).json({
        error: 'Forbidden: full verification is required for this action',
        verification_status: rows[0]?.verification_status ?? 'unknown'
      });
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Verification check failed' });
  }
};

export default {
  authMiddleware,
  optionalAuthMiddleware,
  generateToken,
  requirePlatformAdmin,
  requireCircleAdmin,
  requireGroupMember,
  requireVerified
};
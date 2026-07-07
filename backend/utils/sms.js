import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const AT_API_URL = process.env.AFRICASTALKING_SANDBOX === 'true'
  ? 'https://api.sandbox.africastalking.com/version1/messaging'
  : 'https://api.africastalking.com/version1/messaging';

const toInternational = (phone) => {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('237')) return `+${digits}`;
  if (digits.length === 9) return `+237${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+237${digits.slice(1)}`;
  if (phone.startsWith('+')) return phone;
  return phone;
};

const sendViaAfricaTalking = async (to, message) => {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey || !username) throw new Error('AfricaStalking credentials missing');

  const payload = {
    username,
    to,
    message
  };

  const resp = await fetch(AT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await resp.json();
  return json;
};

const sendSMS = async (phoneNumber, message) => {
  const to = toInternational(phoneNumber);
  try {
    if (process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME) {
      const result = await sendViaAfricaTalking(to, message);
      console.log(`[SMS] Sent via Africa'sTalking to ${to}:`, result);
      return { status: 'success', provider: 'africastalking', result };
    }

    // fallback: log
    console.log(`[SMS][FALLBACK] to ${to}: ${message}`);
    return { status: 'success', provider: 'log' };
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
};

export const sendOTP = async (phoneNumber, code) => {
  const message = `Your KoloCircle OTP is: ${code}. Valid for 10 minutes. Do not share with anyone.`;
  return sendSMS(phoneNumber, message);
};

export const sendGuarantorConfirmationLink = async (phoneNumber, confirmationLink) => {
  const message = `Hi! You have been named as a guarantor on KoloCircle. Please confirm within 48 hours: ${confirmationLink}`;
  return sendSMS(phoneNumber, message);
};

export const sendGuarantorConfirmationNotice = async (phoneNumber, guarantorName, status) => {
  const message = `Your guarantor ${guarantorName} has ${status === 'confirmed' ? 'confirmed' : 'declined'} their role. ${status === 'confirmed' ? 'You can now proceed.' : 'Please select another guarantor.'}`;
  return sendSMS(phoneNumber, message);
};

export const sendGuarantorReleaseNotice = async (phoneNumber, memberName) => {
  const message = `You have been released as guarantor for ${memberName}. Your responsibilities have ended.`;
  return sendSMS(phoneNumber, message);
};

export const sendVerificationStatusUpdate = async (phoneNumber, status, reviewNote = '') => {
  const statusText = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'received';
  const message = `Your KoloCircle verification has been ${statusText}. ${reviewNote ? 'Note: ' + reviewNote : 'Thank you!'}`;
  return sendSMS(phoneNumber, message);
};

export default { sendOTP, sendGuarantorConfirmationLink, sendGuarantorConfirmationNotice, sendGuarantorReleaseNotice, sendVerificationStatusUpdate };


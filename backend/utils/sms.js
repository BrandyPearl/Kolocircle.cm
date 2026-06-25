import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Africa's Talking SMS API integration
export const sendOTP = async (phoneNumber, code) => {
  try {
    const message = `Your KoloCircle OTP is: ${code}. Valid for 10 minutes. Do not share with anyone.`;
    
    // This would use Africa's Talking API in production
    // For now, we'll just log it
    console.log(`[SMS] OTP to ${phoneNumber}: ${code}`);
    
    // In production, implement the actual API call:
    // const response = await fetch('https://api.sandbox.africastalking.com/version1/messaging', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.AFRICASTALKING_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     username: process.env.AFRICASTALKING_USERNAME,
    //     to: phoneNumber,
    //     message: message
    //   })
    // });

    return { status: 'success', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error('Error sending OTP SMS:', error);
    throw error;
  }
};

export const sendGuarantorConfirmationLink = async (phoneNumber, confirmationLink) => {
  try {
    const message = `Hi! You have been named as a guarantor on KoloCircle. Please confirm within 48 hours: ${confirmationLink}`;
    console.log(`[SMS] Guarantor confirmation to ${phoneNumber}`);
    return { status: 'success', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error('Error sending guarantor confirmation SMS:', error);
    throw error;
  }
};

export const sendGuarantorConfirmationNotice = async (phoneNumber, guarantorName, status) => {
  try {
    const message = `Your guarantor ${guarantorName} has ${status === 'confirmed' ? 'confirmed' : 'declined'} their role. ${status === 'confirmed' ? 'You can now proceed.' : 'Please select another guarantor.'}`;
    console.log(`[SMS] Guarantor ${status} notice to ${phoneNumber}`);
    return { status: 'success', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error('Error sending guarantor confirmation notice SMS:', error);
    throw error;
  }
};

export const sendGuarantorReleaseNotice = async (phoneNumber, memberName) => {
  try {
    const message = `You have been released as guarantor for ${memberName}. Your responsibilities have ended. Your trust score remains unaffected.`;
    console.log(`[SMS] Guarantor release notice to ${phoneNumber}`);
    return { status: 'success', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error('Error sending guarantor release SMS:', error);
    throw error;
  }
};

export const sendVerificationStatusUpdate = async (phoneNumber, status, reviewNote = '') => {
  try {
    const statusText = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'received';
    const message = `Your KoloCircle verification has been ${statusText}. ${reviewNote ? 'Note: ' + reviewNote : 'Thank you!'}`;
    console.log(`[SMS] Verification status to ${phoneNumber}: ${statusText}`);
    return { status: 'success', messageId: `msg_${Date.now()}` };
  } catch (error) {
    console.error('Error sending verification status SMS:', error);
    throw error;
  }
};

export default { sendOTP, sendGuarantorConfirmationLink, sendGuarantorConfirmationNotice, sendGuarantorReleaseNotice, sendVerificationStatusUpdate };


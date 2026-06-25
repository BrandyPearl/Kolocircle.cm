import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const SUBSCRIPTION_KEY = process.env.MTN_MOMO_SUBSCRIPTION_KEY;
const API_USER = process.env.MTN_MOMO_API_USER;
const API_KEY = process.env.MTN_MOMO_API_KEY;

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const initiatePayment = async (phoneNumber, amount, externalId) => {
  try {
    const requestId = generateUUID();
    
    // This would use MTN MoMo API in production
    // For now, we'll simulate the API response
    console.log(`[MoMo] Initiating payment: ${amount} XAF to ${phoneNumber}`);
    console.log(`[MoMo] Reference ID: ${requestId}`);

    // In production, implement the actual API call:
    // const response = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${API_KEY}`,
    //     'X-Reference-Id': requestId,
    //     'X-Target-Environment': 'sandbox',
    //     'Content-Type': 'application/json',
    //     'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
    //   },
    //   body: JSON.stringify({
    //     amount: amount.toString(),
    //     currency: 'XAF',
    //     externalId: externalId,
    //     payer: {
    //       partyIdType: 'MSISDN',
    //       partyId: phoneNumber
    //     },
    //     payerMessage: 'KoloCircle Security Deposit',
    //     payeeNote: 'KoloCircle Verification'
    //   })
    // });

    return { referenceId: requestId, status: 'pending' };
  } catch (error) {
    console.error('Error initiating MoMo payment:', error);
    throw error;
  }
};

export const checkPaymentStatus = async (referenceId) => {
  try {
    // In production, implement the actual API call:
    // const response = await fetch(`${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    //   method: 'GET',
    //   headers: {
    //     'Authorization': `Bearer ${API_KEY}`,
    //     'X-Target-Environment': 'sandbox',
    //     'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
    //   }
    // });

    // For testing, return success after a random delay
    console.log(`[MoMo] Checking payment status: ${referenceId}`);
    
    // Simulate successful payment for demo
    return { status: 'SUCCESSFUL', referenceId: referenceId };
  } catch (error) {
    console.error('Error checking MoMo payment status:', error);
    throw error;
  }
};

export const getBalance = async () => {
  try {
    // In production, implement the actual API call
    console.log('[MoMo] Getting account balance');
    return { balance: 1000000, currency: 'XAF' };
  } catch (error) {
    console.error('Error getting MoMo balance:', error);
    throw error;
  }
};

export default { initiatePayment, checkPaymentStatus, getBalance };


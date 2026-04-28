/**
 * Mapito WiFi Services - Backend API
 * Features:
 * - Package listing
 * - Payment creation & tracking
 * - SMS polling & auto-approval
 * - Voucher generation & validation
 * - FreeRADIUS integration endpoint
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Mapito WiFi Services', timestamp: new Date().toISOString() });
});

// Get all packages
app.get('/api/packages', async (req, res) => {
  try {
    const { data, error } = await supabase.from('packages').select('*').order('price', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Packages error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a pending payment
app.post('/api/payments', async (req, res) => {
  try {
    const { phone_number, amount, package_id } = req.body;
    if (!phone_number || !amount || !package_id) {
      return res.status(400).json({ success: false, error: 'phone_number, amount, and package_id are required' });
    }

    const { data, error } = await supabase
      .from('payments')
      .insert([{ phone_number, amount, package_id, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Payment creation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get payment status
app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('payments').select('*, vouchers(*)').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Payment fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate a random voucher code
function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MAP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create voucher for approved payment
async function createVoucher(payment) {
  try {
    const { data: pkg, error: pkgError } = await supabase.from('packages').select('*').eq('id', payment.package_id).single();
    if (pkgError) throw pkgError;

    let code = generateVoucherCode();
    let exists = true;
    let attempts = 0;

    // Ensure uniqueness
    while (exists && attempts < 10) {
      const { data } = await supabase.from('vouchers').select('id').eq('code', code).single();
      if (!data) exists = false;
      else {
        code = generateVoucherCode();
        attempts++;
      }
    }

    const expiresAt = new Date(Date.now() + pkg.duration_minutes * 60 * 1000);

    const { data: voucher, error } = await supabase
      .from('vouchers')
      .insert([{
        code,
        package_id: payment.package_id,
        payment_id: payment.id,
        phone_number: payment.phone_number,
        duration_minutes: pkg.duration_minutes,
        expires_at: expiresAt.toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Update payment with voucher code
    await supabase.from('payments').update({ status: 'approved', transaction_code: code }).eq('id', payment.id);

    // Send SMS with voucher code
    await sendSMS(payment.phone_number, `Your Mapito WiFi login code is: ${code}. Valid until ${expiresAt.toLocaleString()}. Enjoy browsing!`);

    console.log(`Voucher ${code} created for payment ${payment.id}`);
    return voucher;
  } catch (err) {
    console.error('Voucher creation error:', err);
    throw err;
  }
}

// Send SMS via SMS Gate Cloud
async function sendSMS(phone, message) {
  try {
    const server = process.env.SMS_GATE_SERVER || 'api.sms-gate.app';
    const url = `https://${server}/api/3rdparty/v1/message`;
    const payload = {
      to: phone,
      message: message,
      deviceId: process.env.SMS_GATE_DEVICE_ID
    };
    const auth = Buffer.from(`${process.env.SMS_GATE_USERNAME}:${process.env.SMS_GATE_PASSWORD}`).toString('base64');

    console.log('Sending SMS to:', phone, 'URL:', url);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      timeout: 15000
    });

    console.log('SMS sent to', phone, 'Response:', response.status);
    return response.data;
  } catch (err) {
    console.error('SMS send error:', err.message);
    if (err.response) {
      console.error('SMS send error details:', err.response.status, err.response.data);
    }
    // Don't throw - SMS failure shouldn't break payment flow
  }
}

// Fetch messages from SMS Gate Cloud
async function fetchSMSMessages() {
  try {
    const server = process.env.SMS_GATE_SERVER || 'api.sms-gate.app';
    const url = `https://${server}/api/3rdparty/v1/message`;
    const auth = Buffer.from(`${process.env.SMS_GATE_USERNAME}:${process.env.SMS_GATE_PASSWORD}`).toString('base64');

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${auth}`
      },
      params: {
        deviceId: process.env.SMS_GATE_DEVICE_ID,
        limit: 50
      },
      timeout: 15000
    });

    return response.data || [];
  } catch (err) {
    console.error('SMS fetch error:', err.message);
    if (err.response) {
      console.error('SMS fetch error details:', err.response.status, err.response.data);
    }
    return [];
  }
}

// Parse M-Pesa SMS
function parseMpesaSMS(message) {
  const lowerMsg = message.toLowerCase();
  if (!lowerMsg.includes('confirmed') && !lowerMsg.includes('confirmed.')) return null;
  if (!lowerMsg.includes('ksh')) return null;

  // Extract amount
  const amountMatch = message.match(/Ksh[\s]*([0-9,]+)/i) || message.match(/Kshs?[\s]*([0-9,]+)/i);
  const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : null;

  // Extract transaction code (e.g., SIB5XXX or similar patterns)
  const codeMatch = message.match(/([A-Z0-9]{5,15})/g);
  let transactionCode = null;
  if (codeMatch) {
    for (const c of codeMatch) {
      if (/^[A-Z0-9]{6,10}$/.test(c)) {
        transactionCode = c;
        break;
      }
    }
  }

  // Extract phone number
  const phoneMatch = message.match(/(254[0-9]{9}|07[0-9]{8}|01[0-9]{8})/);
  let phone = phoneMatch ? phoneMatch[1] : null;
  if (phone && phone.startsWith('0')) {
    phone = '254' + phone.substring(1);
  }

  if (!amount || !phone) return null;

  return { amount, phone, transactionCode, raw: message };
}

// Poll and process SMS
async function processPendingSMS() {
  try {
    const messages = await fetchSMSMessages();
    if (!messages.length) return;

    for (const sms of messages) {
      const parsed = parseMpesaSMS(sms.message || sms.body || '');
      if (!parsed) continue;

      // Check if already processed
      const { data: existingLog } = await supabase
        .from('sms_logs')
        .select('id')
        .eq('message', parsed.raw)
        .single();

      if (existingLog) continue;

      // Log SMS
      await supabase.from('sms_logs').insert([{
        sender: sms.phone || sms.sender,
        message: parsed.raw,
        extracted_code: parsed.transactionCode,
        extracted_amount: parsed.amount,
        extracted_phone: parsed.phone,
        processed: true
      }]);

      // Find pending payment matching amount and phone
      const { data: pendingPayments, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'pending')
        .eq('phone_number', parsed.phone)
        .eq('amount', parsed.amount);

      if (payError || !pendingPayments || !pendingPayments.length) {
        console.log('No pending payment matched for SMS:', parsed);
        continue;
      }

      // Approve each matched payment (usually one)
      for (const payment of pendingPayments) {
        // Check if already has voucher
        const { data: existingVoucher } = await supabase
          .from('vouchers')
          .select('*')
          .eq('payment_id', payment.id)
          .single();

        if (existingVoucher) {
          console.log(`Payment ${payment.id} already has voucher, skipping.`);
          continue;
        }

        await createVoucher(payment);
      }
    }
  } catch (err) {
    console.error('SMS processing error:', err);
  }
}

// Cron job: poll SMS every 5 seconds
setInterval(() => {
  processPendingSMS();
}, 5000);

// Also run via node-cron as backup every minute
cron.schedule('* * * * *', () => {
  processPendingSMS();
});

// Validate voucher code (FreeRADIUS integration)
app.post('/api/validate-code', async (req, res) => {
  try {
    const { code, mac, ip } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*, packages(*)')
      .eq('code', code)
      .single();

    if (error || !voucher) {
      return res.status(404).json({ success: false, error: 'Invalid code' });
    }

    if (voucher.is_used) {
      // Check if still valid
      if (new Date(voucher.expires_at) < new Date()) {
        return res.status(403).json({ success: false, error: 'Code has expired' });
      }
      // Allow re-login if within time
      return res.json({
        success: true,
        data: {
          valid: true,
          code: voucher.code,
          duration_minutes: voucher.duration_minutes,
          expires_at: voucher.expires_at
        }
      });
    }

    // Mark as used
    await supabase
      .from('vouchers')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('id', voucher.id);

    res.json({
      success: true,
      data: {
        valid: true,
        code: voucher.code,
        duration_minutes: voucher.duration_minutes,
        expires_at: voucher.expires_at
      }
    });
  } catch (err) {
    console.error('Validation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual check endpoint for a phone number
app.get('/api/check-payment', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, error: 'phone query param required' });

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*, vouchers(*)')
      .eq('phone_number', phone)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    res.json({ success: true, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: list all vouchers
app.get('/api/vouchers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vouchers').select('*, packages(*), payments(*)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: list SMS logs
app.get('/api/sms-logs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sms_logs').select('*').order('received_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Mapito WiFi Services API running on port ${PORT}`);
  console.log(`SMS polling every 5 seconds...`);
});

module.exports = app;

/**
 * Mapito WiFi Services - Frontend Application
 * Handles package selection, payment flow, and real-time status updates
 */

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3000/api' : '/api';
const SUPABASE_URL = 'https://pwxezetkzpvrvnqimkxh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eGV6ZXRrenB2cnZucWlta3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjE3MzAsImV4cCI6MjA5Mjg5NzczMH0.kUU8MYXP4px78LvAlbycq_GG2z5jtiWW6APRJfl5ps0';

let selectedPackage = null;
let currentPaymentId = null;
let pollInterval = null;

// DOM Elements
const sections = {
  packages: document.getElementById('packages-section'),
  payment: document.getElementById('payment-section'),
  waiting: document.getElementById('waiting-section'),
  success: document.getElementById('success-section'),
  login: document.getElementById('login-section')
};

const packagesGrid = document.getElementById('packages-grid');
const selectedPackageInfo = document.getElementById('selected-package-info');
const paymentAmount = document.getElementById('payment-amount');
const paymentForm = document.getElementById('payment-form');
const paymentStatus = document.getElementById('payment-status');
const voucherCodeEl = document.getElementById('voucher-code');
const voucherInfo = document.getElementById('voucher-info');
const loginForm = document.getElementById('login-form');
const tabBtns = document.querySelectorAll('.tab-btn');

// Initialize
async function init() {
  await loadPackages();
  setupEventListeners();
}

// Load packages from API
async function loadPackages() {
  try {
    const res = await fetch(`${API_BASE}/packages`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    packagesGrid.innerHTML = '';
    json.data.forEach(pkg => {
      const card = document.createElement('div');
      card.className = 'package-card';
      card.dataset.id = pkg.id;
      card.dataset.price = pkg.price;
      card.dataset.duration = pkg.duration_minutes;
      card.dataset.name = pkg.name;
      card.dataset.limit = pkg.data_limit || 'Unlimited';

      card.innerHTML = `
        <div class="package-name">${pkg.name}</div>
        <div class="package-data">${pkg.data_limit || 'Unlimited Data'}</div>
        <div class="package-price">${pkg.price}/- <span>(${formatDuration(pkg.duration_minutes)})</span></div>
      `;

      card.addEventListener('click', () => selectPackage(pkg, card));
      packagesGrid.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to load packages. Please refresh.');
    console.error(err);
  }
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hrs`;
  if (minutes === 1440) return '1 day';
  if (minutes === 10080) return '1 week';
  if (minutes === 43200) return '1 month';
  return `${Math.floor(minutes / 1440)} days`;
}

function selectPackage(pkg, cardEl) {
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  selectedPackage = pkg;

  selectedPackageInfo.innerHTML = `
    <div class="name">${pkg.name}</div>
    <div class="price">Ksh ${pkg.price}/-</div>
  `;
  paymentAmount.textContent = `${pkg.price}/-`;

  showSection('payment');
  setActiveTab(0);
}

function backToPackages() {
  selectedPackage = null;
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  showSection('packages');
}

function showPackages() {
  showSection('packages');
  setActiveTab(0);
}

function showLogin() {
  showSection('login');
  setActiveTab(1);
}

function showSection(name) {
  Object.values(sections).forEach(s => s.classList.add('hidden'));
  sections[name].classList.remove('hidden');
}

function setActiveTab(index) {
  tabBtns.forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
}

// Payment form submit
paymentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPackage) return;

  const phoneInput = document.getElementById('phone');
  let phone = phoneInput.value.trim();

  // Normalize phone
  phone = phone.replace(/\s/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.substring(1);
  if (!/^254[0-9]{9}$/.test(phone)) {
    showToast('Please enter a valid Kenyan phone number');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: phone,
        amount: selectedPackage.price,
        package_id: selectedPackage.id
      })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    currentPaymentId = json.data.id;
    showSection('waiting');
    startPolling(phone);
  } catch (err) {
    showToast('Failed to create payment. Please try again.');
    console.error(err);
  }
});

// Poll for payment status
function startPolling(phone) {
  if (pollInterval) clearInterval(pollInterval);

  // Also subscribe to Supabase realtime for instant updates
  subscribeToPaymentChanges(phone);

  pollInterval = setInterval(async () => {
    if (!currentPaymentId) return;
    try {
      const res = await fetch(`${API_BASE}/payments/${currentPaymentId}`);
      const json = await res.json();
      if (!json.success) return;

      const payment = json.data;
      if (payment.status === 'approved' && payment.vouchers && payment.vouchers.length > 0) {
        clearInterval(pollInterval);
        showSuccess(payment.vouchers[0]);
      } else {
        paymentStatus.textContent = 'Still verifying... Please complete M-Pesa payment if not done.';
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 5000);

  // Timeout after 10 minutes
  setTimeout(() => {
    clearInterval(pollInterval);
    paymentStatus.textContent = 'Payment verification timed out. Please contact support.';
  }, 600000);
}

// Supabase realtime subscription
function subscribeToPaymentChanges(phone) {
  try {
    const { createClient } = window.supabase || {};
    if (!createClient) {
      // Load supabase-js if not available
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = () => setupRealtime(phone);
      document.head.appendChild(script);
    } else {
      setupRealtime(phone);
    }
  } catch (e) {
    console.log('Realtime not available, falling back to polling');
  }
}

function setupRealtime(phone) {
  if (!window.supabase) return;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  client
    .channel('payments-channel')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payments', filter: `phone_number=eq.${phone}` },
      (payload) => {
        const payment = payload.new;
        if (payment.status === 'approved') {
          clearInterval(pollInterval);
          // Fetch voucher details
          fetch(`${API_BASE}/payments/${payment.id}`)
            .then(r => r.json())
            .then(j => {
              if (j.success && j.data.vouchers && j.data.vouchers.length > 0) {
                showSuccess(j.data.vouchers[0]);
              }
            });
        }
      }
    )
    .subscribe();
}

function showSuccess(voucher) {
  showSection('success');
  voucherCodeEl.textContent = voucher.code;
  const expires = new Date(voucher.expires_at);
  voucherInfo.innerHTML = `Valid until <strong>${expires.toLocaleString()}</strong>`;
}

// Login with code
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('login-code').value.trim().toUpperCase();

  try {
    const res = await fetch(`${API_BASE}/validate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    const json = await res.json();
    if (!json.success || !json.data.valid) {
      showToast(json.error || 'Invalid or expired code');
      return;
    }

    showToast('Code valid! Connecting to WiFi...', 'success');
    // In production, redirect to router success URL or trigger login
    voucherCodeEl.textContent = json.data.code;
    const expires = new Date(json.data.expires_at);
    voucherInfo.innerHTML = `Valid until <strong>${expires.toLocaleString()}</strong>`;
    showSection('success');
  } catch (err) {
    showToast('Failed to validate code');
    console.error(err);
  }
});

// Copy utilities
function copyTill() {
  navigator.clipboard.writeText('5441898').then(() => showToast('Till number copied!'));
}

function copyVoucher() {
  const code = voucherCodeEl.textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Code copied!'));
}

// Toast notification
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (type === 'success') {
    toast.style.borderColor = 'var(--success)';
    toast.style.color = 'var(--success)';
  }
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function setupEventListeners() {
  // Any additional listeners
}

// Start
init();

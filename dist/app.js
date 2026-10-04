const $ = (selector) => document.querySelector(selector);
const merchantForm = $('#merchantForm');
const resultDialog = $('#resultDialog');
const toast = $('#toast');
let currentMerchant = null;
let qrInstance = null;

const demoMerchant = {
  shopName: 'Anand Chai Corner',
  upiId: 'anandchai@okaxis',
  amount: '120',
  reviewUrl: 'https://www.google.com/search?q=Anand+Chai+Corner',
  paymentNote: 'Chai bill'
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '5';
}

function customerUrl(merchant) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('mode', 'customer');
  url.searchParams.set('shop', merchant.shopName);
  url.searchParams.set('upi', merchant.upiId);
  if (merchant.amount) url.searchParams.set('amount', merchant.amount);
  url.searchParams.set('review', merchant.reviewUrl);
  if (merchant.paymentNote) url.searchParams.set('note', merchant.paymentNote);
  return url.toString();
}

function upiUrl(merchant, amount) {
  const params = new URLSearchParams({
    pa: merchant.upiId,
    pn: merchant.shopName,
    tn: merchant.paymentNote || 'Payment',
    cu: 'INR'
  });
  if (amount && Number(amount) > 0) params.set('am', Number(amount).toFixed(2));
  return `upi://pay?${params.toString()}`;
}

function normalizeReviewUrl(value) {
  const raw = value.trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function validateMerchant(merchant) {
  if (!merchant.upiId.includes('@')) return 'Enter a valid UPI ID such as shop@okaxis.';
  try {
    const review = new URL(merchant.reviewUrl);
    if (!['http:', 'https:'].includes(review.protocol)) throw new Error();
  } catch {
    return 'Enter a valid Google review link.';
  }
  if (merchant.amount && (Number(merchant.amount) <= 0 || Number(merchant.amount) > 100000)) return 'Enter an amount between ₹1 and ₹1,00,000.';
  return '';
}

function renderQr(link) {
  const target = $('#qrCode');
  target.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    target.innerHTML = '<span style="display:grid;place-items:center;height:100%;font-size:12px">QR library unavailable.<br>Use the link instead.</span>';
    return;
  }
  qrInstance = new QRCode(target, { text: link, width: 190, height: 190, colorDark: '#102820', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function showResult(merchant) {
  currentMerchant = merchant;
  const link = customerUrl(merchant);
  $('#shareLink').value = link;
  $('#qrShopName').textContent = merchant.shopName;
  renderQr(link);
  resultDialog.showModal();
}

function showCustomer(merchant) {
  currentMerchant = merchant;
  $('#mainSite').hidden = true;
  $('.nav').hidden = true;
  $('#customerView').hidden = false;
  $('#customerShopName').textContent = merchant.shopName;
  $('#customerInitials').textContent = initials(merchant.shopName);
  $('#customerAmount').value = merchant.amount || '';
  updatePayLabel();
  window.scrollTo(0, 0);
}

function hideCustomer() {
  $('#customerView').hidden = true;
  $('#mainSite').hidden = false;
  $('.nav').hidden = false;
  const url = new URL(window.location.href);
  url.search = '';
  history.replaceState({}, '', url.pathname + url.hash);
  window.scrollTo(0, 0);
}

function updatePayLabel() {
  const amount = $('#customerAmount').value.trim();
  $('#payAmountLabel').textContent = amount && Number(amount) > 0 ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
}

merchantForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const merchant = {
    shopName: $('#shopName').value.trim(),
    upiId: $('#upiId').value.trim(),
    amount: $('#amount').value.trim(),
    reviewUrl: normalizeReviewUrl($('#reviewUrl').value),
    paymentNote: $('#paymentNote').value.trim()
  };
  const error = validateMerchant(merchant);
  if (error) return showToast(error);
  localStorage.setItem('paanchMerchant', JSON.stringify(merchant));
  showResult(merchant);
});

$('#copyLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#shareLink').value);
    showToast('Customer link copied');
    $('#copyLink').textContent = 'Copied';
    setTimeout(() => $('#copyLink').textContent = 'Copy', 1800);
  } catch {
    $('#shareLink').select();
    document.execCommand('copy');
    showToast('Customer link copied');
  }
});

$('#previewPage').addEventListener('click', () => {
  resultDialog.close();
  showCustomer(currentMerchant);
});

$('#downloadQr').addEventListener('click', () => {
  const canvas = $('#qrCode canvas');
  const image = $('#qrCode img');
  const source = canvas?.toDataURL('image/png') || image?.src;
  if (!source) return showToast('QR image is not ready yet');
  const link = document.createElement('a');
  link.download = `${currentMerchant.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-paanch-qr.png`;
  link.href = source;
  link.click();
  showToast('QR downloaded');
});

$('#closeDialog').addEventListener('click', () => resultDialog.close());
$('#customerBack').addEventListener('click', hideCustomer);
$('#customerAmount').addEventListener('input', updatePayLabel);
$('#customerReview').addEventListener('click', () => window.open(currentMerchant.reviewUrl, '_blank', 'noopener,noreferrer'));
$('#customerPay').addEventListener('click', () => {
  const amount = $('#customerAmount').value.trim();
  if (!amount || Number(amount) <= 0) return showToast('Enter the amount you want to pay');
  window.location.href = upiUrl(currentMerchant, amount);
});

$('#viewDemo').addEventListener('click', () => showCustomer(demoMerchant));
$('#heroReview').addEventListener('click', () => window.open(demoMerchant.reviewUrl, '_blank', 'noopener,noreferrer'));
$('#heroPay').addEventListener('click', () => showCustomer(demoMerchant));
$('#reviewHelp').addEventListener('click', () => showToast('In Google Business Profile: Ask for reviews → copy your review link.'));
$('#googleSignIn').addEventListener('click', () => {
  showToast('Google sign-in needs your OAuth Client ID. Preview mode opened.');
  document.querySelector('#merchant').scrollIntoView({ behavior: 'smooth' });
});

const saved = localStorage.getItem('paanchMerchant');
if (saved) {
  try {
    const merchant = JSON.parse(saved);
    $('#shopName').value = merchant.shopName || '';
    $('#upiId').value = merchant.upiId || '';
    $('#amount').value = merchant.amount || '';
    $('#reviewUrl').value = merchant.reviewUrl || '';
    $('#paymentNote').value = merchant.paymentNote || '';
  } catch { localStorage.removeItem('paanchMerchant'); }
}

const params = new URLSearchParams(window.location.search);
if (params.get('mode') === 'customer') {
  const merchant = {
    shopName: params.get('shop') || 'Local shop',
    upiId: params.get('upi') || '',
    amount: params.get('amount') || '',
    reviewUrl: params.get('review') || 'https://google.com',
    paymentNote: params.get('note') || 'Payment'
  };
  showCustomer(merchant);
}

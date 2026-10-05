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
  discount: '10',
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
  if (Number(merchant.discount) > 0) url.searchParams.set('discount', merchant.discount);
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

function money(value) {
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number(value) % 1 ? 2 : 0 })}`;
}

function payableAmount(amount, discount) {
  const original = Number(amount);
  const percent = Math.min(100, Math.max(0, Number(discount) || 0));
  return Math.round(original * (1 - percent / 100) * 100) / 100;
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
  if (merchant.discount && (Number(merchant.discount) < 0 || Number(merchant.discount) > 100)) return 'Enter a discount between 0% and 100%.';
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
  const discount = Number(merchant.discount) || 0;
  $('#qrDiscount').hidden = discount <= 0;
  $('#qrDiscount').textContent = discount > 0 ? `${discount}% payment discount` : '';
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
  const original = Number(amount);
  const discount = Math.min(100, Math.max(0, Number(currentMerchant?.discount) || 0));
  const payable = amount && original > 0 ? payableAmount(original, discount) : 0;
  const hasDiscount = discount > 0 && original > 0;

  $('#discountBadge').hidden = !hasDiscount;
  $('#discountSummary').hidden = !hasDiscount;
  if (hasDiscount) {
    $('#discountBadge').textContent = `${discount}% OFF`;
    $('#discountPercent').textContent = `${discount}% discount on ${money(original)}`;
    $('#savedAmount').textContent = money(original - payable);
  }

  const payButton = $('#customerPay');
  payButton.disabled = Boolean(amount && original > 0 && payable === 0);
  if (payButton.disabled) payButton.innerHTML = 'No payment due · 100% discounted';
  else payButton.innerHTML = `Pay <span id="payAmountLabel">${payable > 0 ? money(payable) : ''}</span> with any UPI app <span>→</span>`;
}

merchantForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const merchant = {
    shopName: $('#shopName').value.trim(),
    upiId: $('#upiId').value.trim(),
    amount: $('#amount').value.trim(),
    discount: $('#discount').value.trim(),
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
$('#reviewText').addEventListener('input', () => {
  $('#reviewCount').textContent = `${$('#reviewText').value.length} / 500`;
});

document.querySelectorAll('input[name="rating"]').forEach((input) => {
  input.addEventListener('change', () => {
    const stars = document.querySelector('input[name="rating"]:checked')?.value || '5';
    $('#selectedRating').textContent = `${stars} star${stars === '1' ? '' : 's'} selected`;
  });
});

$('#customerReview').addEventListener('click', async () => {
  const reviewText = $('#reviewText').value.trim();
  const stars = document.querySelector('input[name="rating"]:checked')?.value || '5';
  const starCharacters = '★'.repeat(Number(stars));
  const copiedReview = reviewText ? `${starCharacters}\n${reviewText}` : starCharacters;
  window.open(currentMerchant.reviewUrl, '_blank', 'noopener,noreferrer');

  try {
    await navigator.clipboard.writeText(copiedReview);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = copiedReview;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  showToast(`${stars} star${stars === '1' ? '' : 's'} and text copied—paste on Google, then select the official rating`);
});
$('#customerPay').addEventListener('click', () => {
  const amount = $('#customerAmount').value.trim();
  if (!amount || Number(amount) <= 0) return showToast('Enter the amount you want to pay');
  const payable = payableAmount(amount, currentMerchant.discount);
  if (payable <= 0) return showToast('Your bill is fully discounted—no payment is due');
  window.location.href = upiUrl(currentMerchant, payable);
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
    $('#discount').value = merchant.discount || '';
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
    discount: params.get('discount') || '',
    reviewUrl: params.get('review') || 'https://google.com',
    paymentNote: params.get('note') || 'Payment'
  };
  showCustomer(merchant);
}

const $ = (selector) => document.querySelector(selector);
const merchantForm = $('#merchantForm');
const resultDialog = $('#resultDialog');
const authDialog = $('#authDialog');
const toast = $('#toast');
let currentMerchant = null;
let qrInstance = null;
const ACCOUNT_KEY = 'onescanMerchantAccount';
const SESSION_KEY = 'onescanMerchantSession';
const GOOGLE_CLIENT_ID = '96137544394-n9o475hrb1egqr67p0ussrdg0cbl391l.apps.googleusercontent.com';
let googleAuthInitialized = false;

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
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '1';
}

function readStoredJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { localStorage.removeItem(key); return null; }
}

function merchantAccount() { return readStoredJson(ACCOUNT_KEY); }
function merchantSession() { return readStoredJson(SESSION_KEY); }
function isMerchantSignedIn() {
  const account = merchantAccount();
  const session = merchantSession();
  return Boolean(account?.email && session?.email === account.email);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

async function passwordDigest(password, salt) {
  const value = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', value);
  return bytesToBase64(new Uint8Array(digest));
}

function setAuthMode(mode) {
  const signup = mode === 'signup';
  $('#signupForm').hidden = !signup;
  $('#loginForm').hidden = signup;
  $('#signupTab').setAttribute('aria-selected', String(signup));
  $('#loginTab').setAttribute('aria-selected', String(!signup));
  $('#authStatus').textContent = '';
  $('#authStatus').classList.remove('is-success');
}

function openAuth(mode = 'signup') {
  setAuthMode(mode);
  if (!authDialog.open) authDialog.showModal();
  setTimeout(() => {
    renderGoogleButtons();
    (mode === 'signup' ? $('#signupName') : $('#loginEmail')).focus();
  }, 30);
}

async function handleGoogleCredential(credentialResponse) {
  const status = $('#authStatus');
  status.classList.remove('is-success');
  status.textContent = 'Verifying your Google account…';

  try {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credentialResponse.credential })
    });
    const result = await response.json();
    if (!response.ok || !result.account) throw new Error(result.error || 'Google sign-in failed');

    const account = {
      name: result.account.name,
      email: result.account.email.toLowerCase(),
      googleSub: result.account.id,
      picture: result.account.picture,
      provider: 'google'
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: account.email, provider: 'google' }));
    status.classList.add('is-success');
    status.textContent = 'Google account verified.';
    syncMerchantAccess();
    setTimeout(() => {
      authDialog.close();
      document.querySelector('#merchant').scrollIntoView({ behavior: 'smooth' });
      showToast(`Welcome, ${account.name.split(/\s+/)[0]}`);
    }, 250);
  } catch (error) {
    status.textContent = error.message || 'Google sign-in could not be verified. Try again.';
  }
}

function renderGoogleButtons() {
  if (!googleAuthInitialized || !window.google?.accounts?.id) return;
  ['#signupGoogle', '#loginGoogle'].forEach((selector) => {
    const host = $(selector);
    if (!host || host.childElementCount) return;
    const width = Math.min(400, Math.max(240, Math.floor(host.clientWidth || 320)));
    google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width
    });
  });
}

function initializeGoogleAuth() {
  if (googleAuthInitialized) return true;
  if (!window.google?.accounts?.id) return false;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    ux_mode: 'popup',
    use_fedcm_for_prompt: true
  });
  googleAuthInitialized = true;
  renderGoogleButtons();
  return true;
}

function syncMerchantAccess() {
  const signedIn = isMerchantSignedIn();
  const account = merchantAccount();
  $('#merchantAccessGate').hidden = signedIn;
  merchantForm.hidden = !signedIn;
  if (signedIn) {
    $('#merchantAccountName').textContent = account.name;
    $('#merchantAccountEmail').textContent = account.email;
    $('#merchantAvatar').textContent = initials(account.name).slice(0, 1);
    $('#googleSignIn').lastChild.textContent = ` ${account.name.split(/\s+/)[0]}`;
  } else {
    $('#googleSignIn').lastChild.textContent = ' Merchant login';
  }
}

function moveToMerchant(event, mode = 'signup') {
  if (event) event.preventDefault();
  if (isMerchantSignedIn()) {
    document.querySelector('#merchant').scrollIntoView({ behavior: 'smooth' });
  } else {
    openAuth(mode);
  }
}

function customerUrl(merchant) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('m', 'c');
  url.searchParams.set('s', merchant.shopName);
  url.searchParams.set('u', merchant.upiId);
  if (merchant.amount) url.searchParams.set('a', merchant.amount);
  if (Number(merchant.discount) > 0) url.searchParams.set('d', merchant.discount);
  url.searchParams.set('r', merchant.reviewUrl);
  if (merchant.paymentNote) url.searchParams.set('n', merchant.paymentNote);
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
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isGoogleHost = host === 'google.com' || host.endsWith('.google.com');
    if (isGoogleHost && url.pathname === '/search' && url.hash.startsWith('#sv=')) {
      const compact = new URL(`${url.protocol}//${url.host}/search`);
      const query = url.searchParams.get('q');
      const placeSignal = url.searchParams.get('si');
      if (query) compact.searchParams.set('q', query);
      if (placeSignal) compact.searchParams.set('si', placeSignal);
      compact.hash = url.hash;
      return compact.toString();
    }
  } catch {
    return normalized;
  }
  return normalized;
}

function reviewLinkError(value) {
  const raw = normalizeReviewUrl(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isGoogleHost = host === 'google.com' || host.endsWith('.google.com');
    const hasDirectReviewState = isGoogleHost && url.hash.startsWith('#sv=');
    const isGenericSearch = isGoogleHost && url.pathname === '/search' && !hasDirectReviewState;
    if (isGenericSearch) {
      return 'This is a Google Search page, not a direct review form. Open the restaurant’s Write a review screen and copy that link.';
    }
    if (raw.length > 600 && !hasDirectReviewState) {
      return 'This link is too long for a reliable QR. Use Google Business Profile → Ask for reviews → Copy link.';
    }
    if (!['http:', 'https:'].includes(url.protocol)) return 'Enter a valid Google review link.';
  } catch {
    return 'Enter a valid Google review link.';
  }
  return '';
}

function updateReviewLinkStatus() {
  const input = $('#reviewUrl');
  const status = $('#reviewLinkStatus');
  const typed = input.value.trim();
  const prepared = normalizeReviewUrl(typed);
  const typedWithProtocol = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  const wasSimplified = Boolean(typed) && prepared.length < typedWithProtocol.length;
  const error = reviewLinkError(typed);
  status.classList.toggle('is-error', Boolean(error));
  status.classList.toggle('is-good', Boolean(typed) && !error);
  input.setAttribute('aria-invalid', error ? 'true' : 'false');
  if (error) status.textContent = error;
  else if (wasSimplified) status.textContent = '✓ Direct Google review link found. We’ll shorten it automatically for the QR.';
  else if (typed) status.textContent = '✓ This link is ready for the customer QR.';
  else status.textContent = 'Use the short link from Google Business Profile—not a Google Search result.';
}

function validateMerchant(merchant) {
  if (!merchant.upiId.includes('@')) return 'Enter a valid UPI ID such as shop@okaxis.';
  try {
    const review = new URL(merchant.reviewUrl);
    if (!['http:', 'https:'].includes(review.protocol)) throw new Error();
  } catch {
    return 'Enter a valid Google review link.';
  }
  const reviewError = reviewLinkError(merchant.reviewUrl);
  if (reviewError) return reviewError;
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
  qrInstance = new QRCode(target, { text: link, width: 190, height: 190, colorDark: '#102820', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.L });
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
  if (!isMerchantSignedIn()) return openAuth('login');
  const enteredReviewUrl = $('#reviewUrl').value.trim();
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
  const enteredWithProtocol = /^https?:\/\//i.test(enteredReviewUrl) ? enteredReviewUrl : `https://${enteredReviewUrl}`;
  const linkWasSimplified = merchant.reviewUrl.length < enteredWithProtocol.length;
  $('#reviewUrl').value = merchant.reviewUrl;
  updateReviewLinkStatus();
  localStorage.setItem('paanchMerchant', JSON.stringify(merchant));
  showResult(merchant);
  if (linkWasSimplified) showToast('Google review link shortened for a cleaner QR');
});

$('#reviewUrl').addEventListener('input', updateReviewLinkStatus);

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

$('#downloadQr').addEventListener('click', async () => {
  const button = $('#downloadQr');
  if (typeof html2canvas === 'undefined') return showToast('Poster exporter is still loading. Try again in a moment.');
  button.disabled = true;
  button.textContent = 'Preparing poster…';
  try {
    const poster = await html2canvas($('.qr-panel'), {
      scale: 3,
      backgroundColor: null,
      useCORS: true,
      logging: false,
      onclone: (clonedDocument) => {
        clonedDocument.querySelector('.qr-panel h2').textContent = 'Scan me';
      }
    });
    const link = document.createElement('a');
    link.download = `${currentMerchant.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-onescan-poster.png`;
    link.href = poster.toDataURL('image/png');
    link.click();
    showToast('Illustrated QR poster downloaded');
  } catch {
    showToast('Could not create the poster. Try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Download poster';
  }
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

function copyTextImmediately(text) {
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.left = '-9999px';
  helper.style.top = '0';
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  helper.remove();
  return copied;
}

$('#customerReview').addEventListener('click', async () => {
  const reviewText = $('#reviewText').value.trim();
  const stars = document.querySelector('input[name="rating"]:checked')?.value || '5';
  const starCharacters = '★'.repeat(Number(stars));
  const copiedReview = reviewText ? `${starCharacters}\n${reviewText}` : starCharacters;
  const reviewButton = $('#customerReview');
  let copied = false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(copiedReview);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) copied = copyTextImmediately(copiedReview);

  if (!copied) {
    $('#reviewText').focus();
    $('#reviewText').select();
    showToast('Copy was blocked. Your review text is selected—copy it, then try again.');
    return;
  }

  reviewButton.innerHTML = 'Copied! Opening Google… <span>↗</span>';
  showToast(`${stars} star${stars === '1' ? '' : 's'} and text copied—paste it on Google`);
  setTimeout(() => window.location.assign(currentMerchant.reviewUrl), 180);
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
$('#reviewHelp').addEventListener('click', () => showToast('Open Google Business Profile → Ask for reviews → Copy link. It usually starts with g.page/r/.'));
$('#googleSignIn').addEventListener('click', () => isMerchantSignedIn() ? moveToMerchant() : openAuth('login'));
$('#createShopPage').addEventListener('click', (event) => moveToMerchant(event, 'signup'));
$('#merchantNavLink').addEventListener('click', (event) => moveToMerchant(event, 'login'));
$('#closingMerchantLink').addEventListener('click', (event) => moveToMerchant(event, 'signup'));
$('#openMerchantSignup').addEventListener('click', () => openAuth('signup'));
$('#openMerchantLogin').addEventListener('click', () => openAuth('login'));
$('#closeAuthDialog').addEventListener('click', () => authDialog.close());
$('#signupTab').addEventListener('click', () => setAuthMode('signup'));
$('#loginTab').addEventListener('click', () => setAuthMode('login'));

$('#signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#signupName').value.trim();
  const email = $('#signupEmail').value.trim().toLowerCase();
  const password = $('#signupPassword').value;
  if (!name || !email || password.length < 6) {
    $('#authStatus').textContent = 'Enter your name, email and a password with at least 6 characters.';
    return;
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const passwordHash = await passwordDigest(password, salt);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ name, email, salt, passwordHash }));
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
  $('#signupForm').reset();
  syncMerchantAccess();
  authDialog.close();
  document.querySelector('#merchant').scrollIntoView({ behavior: 'smooth' });
  showToast('Merchant account created');
});

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  const account = merchantAccount();
  if (account?.provider === 'google' && account.email === email) {
    $('#authStatus').textContent = 'This merchant account uses Google. Choose Continue with Google above.';
    return;
  }
  if (!account || account.email !== email || await passwordDigest(password, account.salt) !== account.passwordHash) {
    $('#authStatus').textContent = 'Email or password does not match the account on this device.';
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email }));
  $('#loginForm').reset();
  syncMerchantAccess();
  authDialog.close();
  document.querySelector('#merchant').scrollIntoView({ behavior: 'smooth' });
  showToast('Logged in');
});

$('#merchantLogout').addEventListener('click', () => {
  localStorage.removeItem(SESSION_KEY);
  syncMerchantAccess();
  showToast('Logged out');
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
updateReviewLinkStatus();
syncMerchantAccess();

if (!initializeGoogleAuth()) {
  $('#googleIdentityScript')?.addEventListener('load', initializeGoogleAuth, { once: true });
}

const params = new URLSearchParams(window.location.search);
if (params.get('m') === 'c' || params.get('mode') === 'customer') {
  const merchant = {
    shopName: params.get('s') || params.get('shop') || 'Local shop',
    upiId: params.get('u') || params.get('upi') || '',
    amount: params.get('a') || params.get('amount') || '',
    discount: params.get('d') || params.get('discount') || '',
    reviewUrl: params.get('r') || params.get('review') || 'https://google.com',
    paymentNote: params.get('n') || params.get('note') || 'Payment'
  };
  showCustomer(merchant);
}

const transactionApiBase = `${API_BASE_URL}/wallet`;

function authHeaders() {
  const token = userManager.getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const TransactionAPI = {
  async getTransactions() {
    const res = await fetch(`${transactionApiBase}/transactions`, { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load transactions');
    }
    return (await res.json()).transactions;
  }
};

function formatXAF(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('en-US');
  return `${sign}XAF ${abs}`;
}

function formatDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function setActiveFilter(filter) {
  document.querySelectorAll('.transactions-filter button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTransactions(currentTransactions, filter);
}

function sanitizeText(str) {
  return String(str || '').replace(/-/g, '');
}

let currentTransactions = [];

async function loadTransactionsPage() {
  if (!userManager.isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  document.querySelectorAll('.transactions-filter button').forEach(btn => {
    btn.addEventListener('click', () => setActiveFilter(btn.dataset.filter));
  });

  document.getElementById('profileInitials').textContent = '--';
  document.getElementById('welcomeName').textContent = 'Loading…';
  document.getElementById('profileLocation').textContent = '';

  try {
    const [user, transactions] = await Promise.all([
      userManager.getFullUserData(),
      TransactionAPI.getTransactions()
    ]);

    if (user) {
      document.getElementById('profileInitials').textContent = user.full_name
        ? user.full_name.split(' ').map(p => p[0].toUpperCase()).slice(0, 2).join('')
        : '??';
      document.getElementById('welcomeName').textContent = sanitizeText(user.full_name || '');
      document.getElementById('profileLocation').textContent = sanitizeText(`${user.town || user.city || ''}${user.region ? `, ${user.region}` : ''}`);
    }

    currentTransactions = transactions;
    renderTransactions(transactions, 'all');
  } catch (err) {
    document.getElementById('transactionsBody').innerHTML = `
      <tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load transactions</h3><p>${err.message}</p></div></td></tr>`;
  }
}

function renderTransactions(transactions, filter) {
  const tbody = document.getElementById('transactionsBody');
  const filtered = transactions.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'contributions') return tx.type.toLowerCase() === 'contribution';
    if (filter === 'payouts') return tx.type.toLowerCase() === 'payout';
    if (filter === 'topups') return tx.type.toLowerCase() === 'top up';
    if (filter === 'withdrawals') return tx.type.toLowerCase() === 'withdrawal';
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-circle-check"></i><h3>No transactions found</h3><p>Try another filter or check back later.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(tx => {
    const amountClass = tx.direction === 'credit' ? 'amt-pos' : 'amt-neg';
    const amountPrefix = tx.direction === 'credit' ? '+' : '-';
    return `
      <tr>
        <td>${sanitizeText(formatDate(tx.date))}</td>
        <td>${sanitizeText(tx.description)}</td>
        <td>${sanitizeText(tx.method)}</td>
        <td>${sanitizeText(tx.type)}</td>
        <td><span class="badge ${tx.status.toLowerCase()}">${sanitizeText(tx.status)}</span></td>
        <td style="text-align:right" class="${amountClass}">${amountPrefix} XAF ${Math.abs(tx.amount).toLocaleString('en-US')}</td>
      </tr>`;
  }).join('');
}

window.loadTransactionsPage = loadTransactionsPage;

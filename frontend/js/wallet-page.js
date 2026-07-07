let balanceVisible = false;
let realBalance = 0;
let selectedTopupOperator = 'MTN';
let selectedWithdrawOperator = 'MTN';

document.addEventListener('DOMContentLoaded', () => {
  if (!userManager.isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  loadWalletOverview();
  loadWeeklyActivity();

  document.getElementById('toggleBalanceBtn').addEventListener('click', toggleBalanceVisibility);
  document.getElementById('openTopupBtn').addEventListener('click', () => openModal('topupModal'));
  document.getElementById('openWithdrawBtn').addEventListener('click', () => openModal('withdrawModal'));
  document.getElementById('openSendBtn').addEventListener('click', openSendModal);

  document.getElementById('topupForm').addEventListener('submit', handleTopupSubmit);
  document.getElementById('withdrawForm').addEventListener('submit', handleWithdrawSubmit);
});

// ---------------------------------------------------------------
// OVERVIEW (balance + monthly cards)
// ---------------------------------------------------------------
async function loadWalletOverview() {
  try {
    const overview = await WalletAPI.getOverview();
    realBalance = overview.balance;
    renderBalance();

    const m = overview.thisMonth;
    document.getElementById('topupValue').textContent = formatXAF(m.topup.total);
    document.getElementById('topupCount').textContent = `${m.topup.count} top up${m.topup.count === 1 ? '' : 's'}`;

    document.getElementById('contributionValue').textContent = formatXAF(m.contribution.total);
    document.getElementById('contributionCount').textContent = `${m.contribution.count} contribution${m.contribution.count === 1 ? '' : 's'}`;

    document.getElementById('payoutValue').textContent = formatXAF(m.payout.total);
    document.getElementById('payoutCount').textContent = `${m.payout.count} payout${m.payout.count === 1 ? '' : 's'} this month`;
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderBalance() {
  const el = document.getElementById('balanceValue');
  el.textContent = balanceVisible ? formatXAF(realBalance) : 'XAF •••••';
  el.classList.toggle('masked', !balanceVisible);
}

function toggleBalanceVisibility() {
  balanceVisible = !balanceVisible;
  renderBalance();
  document.getElementById('toggleBalanceIcon').className = balanceVisible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
  document.getElementById('toggleBalanceLabel').textContent = balanceVisible ? 'Hide balance' : 'Show balance';
}

// ---------------------------------------------------------------
// WEEKLY ACTIVITY GRAPH (CSS bars, two series: credit / debit)
// ---------------------------------------------------------------
async function loadWeeklyActivity() {
  const container = document.getElementById('weeklyBars');
  try {
    const days = await WalletAPI.getWeeklyActivity();
    const maxValue = Math.max(...days.map(d => Math.max(d.credit, d.debit)), 1);
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    container.innerHTML = days.map(d => {
      const date = new Date(d.date);
      const label = dayLabels[date.getDay()];
      const creditPct = Math.round((d.credit / maxValue) * 100);
      const debitPct = Math.round((d.debit / maxValue) * 100);
      return `
        <div class="bar">
          <div class="col">
            <span class="a" style="height:${creditPct}%" title="In: ${formatXAF(d.credit)}"></span>
            <span class="b" style="height:${debitPct}%" title="Out: ${formatXAF(d.debit)}"></span>
          </div>
          <small>${label}</small>
        </div>`;
    }).join('');

    const totalCredit = days.reduce((sum, d) => sum + d.credit, 0);
    const totalDebit = days.reduce((sum, d) => sum + d.debit, 0);
    const net = totalCredit - totalDebit;
    const netEl = document.getElementById('weeklyNetFlow');
    netEl.textContent = `${net >= 0 ? '+ ' : ''}${formatXAF(net)}`;
    netEl.style.color = net >= 0 ? 'var(--success)' : '#dc2626';
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="padding:20px"><p>${err.message}</p></div>`;
  }
}

// ---------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function selectOperator(context, operator) {
  if (context === 'topup') selectedTopupOperator = operator;
  if (context === 'withdraw') selectedWithdrawOperator = operator;

  const modalId = context === 'topup' ? 'topupModal' : 'withdrawModal';
  document.querySelectorAll(`#${modalId} .method-select button`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.operator === operator);
  });
}

// ---------------------------------------------------------------
// TOP UP
// ---------------------------------------------------------------
async function handleTopupSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('topup-error');
  const submitBtn = document.getElementById('topup-submit-btn');
  errorEl.classList.remove('show');

  const phoneNumber = document.getElementById('topup-phone').value.trim();
  const amount = Number(document.getElementById('topup-amount').value);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing…';

  try {
    const result = await WalletAPI.topup(phoneNumber, selectedTopupOperator, amount);
    showToast('A Mobile Money prompt has been sent to your phone');
    closeModal('topupModal');
    document.getElementById('topupForm').reset();
    pollTopupStatus(result.referenceId);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Top up';
  }
}

async function pollTopupStatus(referenceId, attempt = 1) {
  if (attempt > 10) {
    showToast('Still waiting for confirmation. Check Transactions shortly.', true);
    return;
  }
  try {
    const status = await WalletAPI.checkTopupStatus(referenceId);
    if (status.status === 'successful') {
      showToast('Top up successful');
      loadWalletOverview();
      loadWeeklyActivity();
      return;
    }
    if (status.status === 'failed') {
      showToast('Top up failed', true);
      return;
    }
    setTimeout(() => pollTopupStatus(referenceId, attempt + 1), 3000);
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------
// WITHDRAW
// ---------------------------------------------------------------
async function handleWithdrawSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('withdraw-error');
  const submitBtn = document.getElementById('withdraw-submit-btn');
  errorEl.classList.remove('show');

  const phoneNumber = document.getElementById('withdraw-phone').value.trim();
  const amount = Number(document.getElementById('withdraw-amount').value);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing…';

  try {
    await WalletAPI.withdraw(phoneNumber, selectedWithdrawOperator, amount);
    showToast('Withdrawal initiated');
    closeModal('withdrawModal');
    document.getElementById('withdrawForm').reset();
    loadWalletOverview();
    loadWeeklyActivity();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Withdraw';
  }
}

// ---------------------------------------------------------------
// SEND -> pick a circle -> opens the existing contribute flow
// ---------------------------------------------------------------
async function openSendModal() {
  openModal('sendModal');
  const listEl = document.getElementById('sendCircleList');
  listEl.innerHTML = `<div class="empty-state" style="padding:30px"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  try {
    const groups = await CircleAPI.getMyGroups();
    if (!groups.length) {
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users"></i><h3>No circles yet</h3><p>Join or create a circle first.</p></div>`;
      return;
    }

    listEl.innerHTML = groups.map(g => `
      <div class="send-circle-pick" onclick="closeModal('sendModal'); openContributeModal(${g.id}, '${g.group_name.replace(/'/g, "\\'")}')">
        <div><strong>${g.group_name}</strong><div class="meta">${frequencyLabel(g.contribution_frequency)} · ${formatXAF(g.contribution_amount)}</div></div>
        <i class="fa-solid fa-chevron-right" style="color:var(--muted)"></i>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

// ---------------------------------------------------------------
// CONTRIBUTE MODAL (same pattern as groups.html / circle.html)
// ---------------------------------------------------------------
async function openContributeModal(groupId, groupName) {
  document.getElementById('contribute-group-name').textContent = groupName;
  openModal('contributeModal');

  const listEl = document.getElementById('contributeList');
  listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><h3>Loading…</h3></div>`;

  try {
    const contributions = await CircleAPI.getMyContributions(groupId);
    const pending = contributions.filter(c => c.status === 'pending');

    if (!pending.length) {
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-check"></i><h3>All caught up</h3><p>No pending contributions for this circle right now.</p></div>`;
      return;
    }

    listEl.innerHTML = pending.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)">
        <div>
          <div style="font-weight:600;color:var(--navy)">Round ${c.contribution_round}</div>
          <div class="meta">${formatXAF(c.amount)} · Cycle ${c.cycle_number}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="payContribution(${c.id})">Pay now</button>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

async function payContribution(contributionId) {
  try {
    const result = await CircleAPI.payContribution(contributionId, null);
    showToast(result.payoutTriggered
      ? "Payment recorded. This round's payout has been triggered."
      : 'Payment recorded successfully');
    closeModal('contributeModal');
    loadWalletOverview();
    loadWeeklyActivity();
  } catch (err) {
    showToast(err.message, true);
  }
}
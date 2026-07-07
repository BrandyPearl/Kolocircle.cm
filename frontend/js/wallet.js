const walletApiBase = `${API_BASE_URL}/wallet`;

const WalletAPI = {
  async getOverview() {
    const res = await fetch(`${walletApiBase}/overview`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load wallet');
    return res.json(); // { balance, thisMonth: { topup, contribution, payout } }
  },

  async getWeeklyActivity() {
    const res = await fetch(`${walletApiBase}/weekly-activity`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load weekly activity');
    return (await res.json()).days;
  },

  async topup(phoneNumber, operator, amount) {
    const res = await fetch(`${walletApiBase}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ phoneNumber, operator, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initiate top up');
    return data;
  },

  async checkTopupStatus(referenceId) {
    const res = await fetch(`${walletApiBase}/topup/status/${referenceId}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to check top up status');
    return data;
  },

  async withdraw(phoneNumber, operator, amount) {
    const res = await fetch(`${walletApiBase}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ phoneNumber, operator, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initiate withdrawal');
    return data;
  }
};
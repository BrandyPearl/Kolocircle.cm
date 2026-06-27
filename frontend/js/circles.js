const circlesApiBase = `${API_BASE_URL}/groups`;

function authHeaders() {
  const token = userManager.getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function showToast(message, isError = false) {
  let toast = document.getElementById('kc-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'kc-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

const CircleAPI = {
  async getMyGroups() {
    const res = await fetch(`${circlesApiBase}/mine`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load your circles');
    return (await res.json()).groups;
  },

  async getPublicGroups() {
    const res = await fetch(`${circlesApiBase}/public`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load public circles');
    return (await res.json()).groups;
  },

  async getInvites() {
    const res = await fetch(`${circlesApiBase}/invites`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load invites');
    return (await res.json()).invites;
  },

  async respondToInvite(membershipId, decision) {
    const res = await fetch(`${circlesApiBase}/invites/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ decision })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to respond to invite');
    return res.json();
  },

  async getGroupDetails(groupId, inviteToken) {
    const url = new URL(`${circlesApiBase}/${groupId}`);
    if (inviteToken) url.searchParams.set('inviteToken', inviteToken);
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load circle');
    return res.json(); // { group, members, activeCycle }
  },

  async createGroup(payload) {
    const res = await fetch(circlesApiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create circle');
    return data.group;
  },

  async requestToJoin(groupId, inviteToken) {
    const res = await fetch(`${circlesApiBase}/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ inviteToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to request to join');
    return data;
  },

  async getMyContributions(groupId) {
    const res = await fetch(`${API_BASE_URL}/groups/${groupId}/contributions`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load contributions');
    return (await res.json()).contributions;
  },

  async payContribution(contributionId, momoReferenceId) {
    const res = await fetch(`${API_BASE_URL}/contributions/${contributionId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ momoReferenceId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to record contribution');
    return data;
  }
};

function formatXAF(amount) {
  return `XAF ${Number(amount).toLocaleString('en-US')}`;
}

function frequencyLabel(freq) {
  return freq === 'weekly' ? 'Weekly' : 'Monthly';
}
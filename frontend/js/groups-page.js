// KoloCircle — groups.html page logic.
// Depends on config.js, user.js, circles.js, app.js loading first.

let selectedVisibility = 'private';
let currentContributeGroupId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!userManager.isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  loadMyGroups();
  loadDiscoverGroups();
  loadInvites();

  document.getElementById('openCreateGroupBtn').addEventListener('click', openCreateGroupModal);
  document.getElementById('createGroupForm').addEventListener('submit', handleCreateGroupSubmit);

  document.getElementById('circleSearch').addEventListener('input', (e) => {
    filterCardsBySearch(e.target.value.trim().toLowerCase());
  });
});

// ---------------------------------------------------------------
// MY GROUPS TAB
// ---------------------------------------------------------------
async function loadMyGroups() {
  const grid = document.getElementById('myGroupsGrid');
  try {
    const groups = await CircleAPI.getMyGroups();
    document.getElementById('myGroupsCount').textContent =
      `${groups.length} active circle${groups.length === 1 ? '' : 's'}`;

    if (!groups.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-users"></i>
          <h3>No circles yet</h3>
          <p>Create one, or check the Discover tab to join an existing circle.</p>
        </div>`;
      return;
    }

    grid.innerHTML = groups.map(renderMyGroupCard).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load your circles</h3><p>${err.message}</p></div>`;
  }
}

function renderMyGroupCard(g) {
  const roleChip = g.is_admin ? '<span class="chip gold">Organiser</span>' : '<span class="chip">Member</span>';
  const positionText = g.payout_order
    ? `Position ${g.payout_order} / ${g.member_count}`
    : (g.group_status === 'in_cycle' ? 'Awaiting payout order' : 'Not yet in an active cycle');
  const progressPct = g.payout_order ? Math.round((g.payout_order / g.member_count) * 100) : 0;

  return `
    <div class="group-card" data-name="${escapeHtml(g.group_name.toLowerCase())}">
      <div class="head">
        <div><h3>${escapeHtml(g.group_name)}</h3><div class="meta">${frequencyLabel(g.contribution_frequency)} · ${formatXAF(g.contribution_amount)}</div></div>
        ${roleChip}
      </div>
      <div class="meta" style="margin-bottom:6px">${positionText}</div>
      <div class="progress-bar" style="margin:0 0 14px"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-dark btn-sm" style="flex:1;justify-content:center" onclick="window.location.href='circle.html?id=${g.id}'">View</button>
        <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center" onclick="openContributeModal(${g.id}, '${escapeHtml(g.group_name)}')">Contribute</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------
// DISCOVER TAB
// ---------------------------------------------------------------
async function loadDiscoverGroups() {
  const grid = document.getElementById('discoverGrid');
  try {
    const groups = await CircleAPI.getPublicGroups();

    if (!groups.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-compass"></i><h3>No public circles right now</h3></div>`;
      return;
    }

    grid.innerHTML = groups.map(renderDiscoverCard).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load public circles</h3><p>${err.message}</p></div>`;
  }
}

function renderDiscoverCard(g) {
  const spotsLeft = g.max_members - g.member_count;
  const pct = Math.round((g.member_count / g.max_members) * 100);
  const isFull = spotsLeft <= 0 || (g.group_status !== 'forming' && g.group_status !== 'between_cycles');

  return `
    <div class="group-card" data-name="${escapeHtml(g.group_name.toLowerCase())}">
      <div class="head">
        <div><h3>${escapeHtml(g.group_name)}</h3><div class="meta">${frequencyLabel(g.contribution_frequency)} · ${formatXAF(g.contribution_amount)}</div></div>
        <span class="chip">Public</span>
      </div>
      <div class="meta" style="margin-bottom:6px">${isFull ? 'Not currently accepting members' : `Open · ${g.member_count} / ${g.max_members} spots`}</div>
      <div class="progress-bar" style="margin:0 0 14px"><div class="progress-fill" style="width:${pct}%"></div></div>
      <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" ${isFull ? 'disabled' : ''} onclick="requestToJoinGroup(${g.id})">
        ${isFull ? 'Unavailable' : 'Request to join'}
      </button>
    </div>`;
}

async function requestToJoinGroup(groupId) {
  try {
    await CircleAPI.requestToJoin(groupId, null);
    showToast('Join request sent — awaiting admin approval');
    loadDiscoverGroups();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------
// INVITES TAB
// ---------------------------------------------------------------
async function loadInvites() {
  const grid = document.getElementById('invitesGrid');
  try {
    const invites = await CircleAPI.getInvites();
    const badge = document.getElementById('inviteCount');

    if (invites.length) {
      badge.textContent = invites.length;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }

    if (!invites.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-envelope-open"></i><h3>No pending invites</h3></div>`;
      return;
    }

    grid.innerHTML = invites.map(renderInviteCard).join('');
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load invites</h3><p>${err.message}</p></div>`;
  }
}

function renderInviteCard(invite) {
  return `
    <div class="group-card">
      <h3>${escapeHtml(invite.group_name)}</h3>
      <div class="meta" style="margin:6px 0">Invited by ${escapeHtml(invite.invited_by)}</div>
      <div class="meta">${frequencyLabel(invite.contribution_frequency)} · ${formatXAF(invite.contribution_amount)}</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="respondInvite(${invite.membership_id}, 'accept')">Accept</button>
        <button class="btn btn-outline btn-sm" style="flex:1;justify-content:center" onclick="respondInvite(${invite.membership_id}, 'decline')">Decline</button>
      </div>
    </div>`;
}

async function respondInvite(membershipId, decision) {
  try {
    await CircleAPI.respondToInvite(membershipId, decision);
    showToast(decision === 'accept' ? 'Invite accepted' : 'Invite declined');
    loadInvites();
    if (decision === 'accept') loadMyGroups();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------
// CREATE GROUP MODAL
// ---------------------------------------------------------------
function openCreateGroupModal() {
  document.getElementById('createGroupModal').classList.add('open');
}
function closeCreateGroupModal() {
  document.getElementById('createGroupModal').classList.remove('open');
  document.getElementById('createGroupForm').reset();
  document.getElementById('cg-error').classList.remove('show');
  selectVisibility('private');
}

function selectVisibility(value) {
  selectedVisibility = value;
  document.querySelectorAll('.visibility-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.visibility === value);
  });
}

async function handleCreateGroupSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('cg-error');
  const submitBtn = document.getElementById('cg-submit-btn');
  errorEl.classList.remove('show');

  const payload = {
    groupName: document.getElementById('cg-name').value.trim(),
    description: document.getElementById('cg-description').value.trim(),
    visibility: selectedVisibility,
    contributionAmount: Number(document.getElementById('cg-amount').value),
    contributionFrequency: document.getElementById('cg-frequency').value,
    maxMembers: Number(document.getElementById('cg-maxmembers').value)
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    const group = await CircleAPI.createGroup(payload);
    closeCreateGroupModal();
    showToast(`"${group.groupName}" created successfully`);
    loadMyGroups();

    if (group.visibility === 'private') {
      showInviteLinkToast(group.inviteToken, group.id);
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create circle';
  }
}

function showInviteLinkToast(inviteToken, groupId) {
  const link = `${window.location.origin}${window.location.pathname.replace('groups.html', 'circle.html')}?id=${groupId}&invite=${inviteToken}`;
  navigator.clipboard?.writeText(link).catch(() => {});
  showToast('Private circle created — invite link copied to clipboard');
}

// ---------------------------------------------------------------
// CONTRIBUTE MODAL
// ---------------------------------------------------------------
async function openContributeModal(groupId, groupName) {
  currentContributeGroupId = groupId;
  document.getElementById('contribute-group-name').textContent = groupName;
  document.getElementById('contributeModal').classList.add('open');

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
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load contributions</h3><p>${err.message}</p></div>`;
  }
}

function closeContributeModal() {
  document.getElementById('contributeModal').classList.remove('open');
  currentContributeGroupId = null;
}

async function payContribution(contributionId) {
  try {
    const result = await CircleAPI.payContribution(contributionId, null);
    showToast(result.payoutTriggered
      ? 'Payment recorded — this round\'s payout has been triggered!'
      : 'Payment recorded successfully');
    closeContributeModal();
    loadMyGroups();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------------------------------------------------------------
// SEARCH FILTER (client-side, across whichever tab is active)
// ---------------------------------------------------------------
function filterCardsBySearch(query) {
  document.querySelectorAll('.group-card[data-name]').forEach(card => {
    const matches = !query || card.dataset.name.includes(query);
    card.style.display = matches ? '' : 'none';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
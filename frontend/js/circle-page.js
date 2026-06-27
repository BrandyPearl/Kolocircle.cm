// KoloCircle — circle.html page logic.
// Depends on config.js, user.js, circles.js, app.js loading first.

let pageGroupId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!userManager.isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  pageGroupId = params.get('id');
  const inviteToken = params.get('invite');

  if (!pageGroupId) {
    document.getElementById('circleContent').innerHTML = `
      <div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>No circle specified</h3>
      <p>Go back to <a href="groups.html">My Groups</a> and select a circle to view.</p></div>`;
    return;
  }

  loadCircle(pageGroupId, inviteToken);
});

async function loadCircle(groupId, inviteToken) {
  const content = document.getElementById('circleContent');
  try {
    const { group, members, activeCycle } = await CircleAPI.getGroupDetails(groupId, inviteToken);
    renderCircle(group, members, activeCycle);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Could not load this circle</h3><p>${err.message}</p></div>`;
  }
}

function renderCircle(group, members, activeCycle) {
  const content = document.getElementById('circleContent');
  const approvedCount = members.filter(m => m.member_status === 'active').length;
  const statusLabel = {
    forming: 'Forming — accepting members',
    in_cycle: 'Cycle in progress',
    between_cycles: 'Between cycles — open to join',
    closed: 'Closed'
  }[group.group_status] || group.group_status;

  content.innerHTML = `
    <div class="circle-hero">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px">
        <div>
          <h1>${escapeHtml(group.group_name)}</h1>
          <div style="color:rgba(255,255,255,.75);font-size:.9rem">${escapeHtml(group.description || 'No description provided')}</div>
        </div>
        ${group.is_admin ? '<span class="chip gold">You organise this circle</span>' : ''}
      </div>
      <div class="meta-row">
        <div><div class="stat-label">Contribution</div><div class="stat-value">${formatXAF(group.contribution_amount)}</div></div>
        <div><div class="stat-label">Frequency</div><div class="stat-value">${frequencyLabel(group.contribution_frequency)}</div></div>
        <div><div class="stat-label">Members</div><div class="stat-value">${approvedCount} / ${group.max_members}</div></div>
        <div><div class="stat-label">Status</div><div class="stat-value" style="font-size:1rem">${statusLabel}</div></div>
        ${activeCycle ? `<div><div class="stat-label">Current cycle</div><div class="stat-value">#${activeCycle.cycle_number}</div></div>` : ''}
      </div>
    </div>

    ${group.visibility === 'private' && group.is_admin && group.invite_token ? renderInviteLinkBox(group) : ''}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="color:var(--navy);font-family:Space Grotesk,sans-serif">Members & rotation order</h3>
      ${!group.is_admin ? `<button class="btn btn-primary btn-sm" onclick="openContributeModal(${group.id}, '${escapeHtml(group.group_name)}')">Contribute</button>` : ''}
    </div>

    <div style="background:var(--white);border:1px solid var(--line);border-radius:16px;overflow:hidden">
      <table class="roster-table">
        <thead><tr><th>Member</th><th>Phone</th><th>Payout order</th><th>Round status</th></tr></thead>
        <tbody>
          ${members.length ? members.map(renderMemberRow).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">No approved members yet</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderMemberRow(m) {
  const order = m.payout_order ?? '—';
  const roundStatus = m.has_been_paid === null
    ? '<span class="meta">No active cycle</span>'
    : (m.has_been_paid ? '<span class="chip gold">Paid out</span>' : '<span class="chip">Pending</span>');

  return `
    <tr>
      <td>${escapeHtml(m.full_name)}</td>
      <td>${escapeHtml(m.phone)}</td>
      <td>${order}</td>
      <td>${roundStatus}</td>
    </tr>`;
}

function renderInviteLinkBox(group) {
  const link = `${window.location.origin}/frontend/pages/circle.html?id=${group.id}&invite=${group.invite_token}`;
  return `
    <div style="margin-bottom:24px">
      <label style="font-size:.82rem;color:var(--muted);font-weight:600">Private invite link</label>
      <div class="invite-link-box">
        <input type="text" readonly value="${link}" id="inviteLinkInput">
        <button onclick="copyInviteLink()"><i class="fa-solid fa-copy"></i></button>
      </div>
    </div>`;
}

function copyInviteLink() {
  const input = document.getElementById('inviteLinkInput');
  navigator.clipboard?.writeText(input.value).then(() => showToast('Invite link copied'));
}

// ---------------------------------------------------------------
// CONTRIBUTE MODAL (same behavior as on groups.html)
// ---------------------------------------------------------------
async function openContributeModal(groupId, groupName) {
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
}

async function payContribution(contributionId) {
  try {
    const result = await CircleAPI.payContribution(contributionId, null);
    showToast(result.payoutTriggered
      ? 'Payment recorded — this round\'s payout has been triggered!'
      : 'Payment recorded successfully');
    closeContributeModal();
    loadCircle(pageGroupId, null);
  } catch (err) {
    showToast(err.message, true);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
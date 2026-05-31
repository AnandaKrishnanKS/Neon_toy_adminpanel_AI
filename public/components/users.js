import { state } from './state.js';

export async function loadUsers() {
  const container = document.getElementById('users-table-body');
  container.innerHTML = `<tr><td colspan="7" class="loading-state">Loading user profiles...</td></tr>`;

  try {
    const res = await fetch('/api/users');
    state.usersData = await res.json();
    renderUsers(state.usersData);
  } catch (error) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state" style="color: var(--accent-cancelled)">Error loading users.</td></tr>`;
  }
}

export function renderUsers(users) {
  const container = document.getElementById('users-table-body');
  container.innerHTML = '';

  if (users.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state">No users registered yet.</td></tr>`;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${u.avatar || 'https://i.pravatar.cc/150'}" class="user-avatar-cell" alt="${u.name}"></td>
      <td><strong>${u.name || 'Anonymous User'}</strong></td>
      <td>${u.email}</td>
      <td>${u.phone || '—'}</td>
      <td>${u.city || '—'}</td>
      <td>${u.address || '—'}</td>
      <td><code>${u.zipcode || '—'}</code></td>
    `;
    container.appendChild(tr);
  });
}

export function filterUsers(e) {
  const query = e.target.value.toLowerCase();
  const filtered = state.usersData.filter(u => 
    (u.name && u.name.toLowerCase().includes(query)) || 
    u.email.toLowerCase().includes(query)
  );
  renderUsers(filtered);
}

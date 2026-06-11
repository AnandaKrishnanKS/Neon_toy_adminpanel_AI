export async function loadTerms() {
  const editor = document.getElementById('terms-editor');
  const timestampBadge = document.getElementById('terms-last-updated');
  const statusMessage = document.getElementById('terms-status-message');

  statusMessage.textContent = '';
  statusMessage.className = 'terms-status-msg';

  editor.disabled = true;
  editor.value = 'Loading terms and conditions from database...';
  timestampBadge.textContent = 'Last updated: Loading...';

  try {
    const res = await fetch('/api/terms');
    const data = await res.json();
    
    editor.value = data.content || '';
    
    if (data.updated_at) {
      const date = new Date(data.updated_at);
      timestampBadge.textContent = `Last updated: ${date.toLocaleString()}`;
    } else {
      timestampBadge.textContent = 'Last updated: Never';
    }
  } catch (error) {
    console.error('Error loading terms:', error);
    statusMessage.textContent = '❌ Failed to load terms from database.';
    statusMessage.className = 'terms-status-msg error';
    editor.value = '';
    timestampBadge.textContent = 'Last updated: Error';
  } finally {
    editor.disabled = false;
  }
}

export async function handleTermsSubmit(e) {
  e.preventDefault();
  
  const editor = document.getElementById('terms-editor');
  const saveBtn = document.getElementById('save-terms-btn');
  const timestampBadge = document.getElementById('terms-last-updated');
  const statusMessage = document.getElementById('terms-status-message');

  const originalBtnHTML = saveBtn.innerHTML;
  
  // Set UI to loading state
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="refresh-spinner"></span> Saving...';
  statusMessage.textContent = 'Saving changes...';
  statusMessage.className = 'terms-status-msg';
  editor.disabled = true;

  try {
    const response = await fetch('/api/terms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: editor.value })
    });

    if (!response.ok) {
      throw new Error('Server responded with an error status');
    }

    const data = await response.json();
    
    // Show success feedback
    statusMessage.textContent = '✅ Terms and Conditions updated successfully!';
    statusMessage.className = 'terms-status-msg success';
    
    if (data.updated_at) {
      const date = new Date(data.updated_at);
      timestampBadge.textContent = `Last updated: ${date.toLocaleString()}`;
    }

    // Clear success message after 4 seconds
    setTimeout(() => {
      if (statusMessage.textContent.includes('updated successfully')) {
        statusMessage.textContent = '';
      }
    }, 4000);

  } catch (error) {
    console.error('Error updating terms:', error);
    statusMessage.textContent = '❌ Failed to update Terms and Conditions.';
    statusMessage.className = 'terms-status-msg error';
  } finally {
    // Restore button state
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalBtnHTML;
    editor.disabled = false;
  }
}

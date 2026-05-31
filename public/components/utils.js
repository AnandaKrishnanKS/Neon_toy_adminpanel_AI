export function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (show) {
    modal.classList.add('open');
  } else {
    modal.classList.remove('open');
  }
}

export function updateUploadPreview(prefix, urls) {
  // urls can be a single URL string, an array of URLs, or a JSON string of URLs
  const fileInput = document.getElementById(`${prefix}-image-file`) || document.getElementById(`${prefix}-banner-file`);
  const isMultiple = fileInput && fileInput.hasAttribute('multiple');

  const hiddenInputSingle = document.getElementById(`${prefix}-image`) || document.getElementById(`${prefix}-banner`);
  const hiddenInputMultiple = document.getElementById(`${prefix}-images`);
  
  const prompt = document.querySelector(`#${prefix}-upload-dropzone .dropzone-prompt`);
  
  let urlList = [];
  if (Array.isArray(urls)) {
    urlList = urls;
  } else if (typeof urls === 'string') {
    if (urls.trim() === '') {
      urlList = [];
    } else if (urls.startsWith('[') && urls.endsWith(']')) {
      try {
        urlList = JSON.parse(urls);
      } catch (e) {
        urlList = [urls];
      }
    } else {
      urlList = [urls];
    }
  }

  // Update hidden inputs
  if (hiddenInputMultiple) {
    hiddenInputMultiple.value = JSON.stringify(urlList);
  }
  if (hiddenInputSingle) {
    hiddenInputSingle.value = urlList[0] || '';
  }

  if (isMultiple) {
    const grid = document.getElementById(`${prefix}-images-preview-grid`);
    if (!grid) return;
    grid.innerHTML = '';

    if (urlList.length > 0) {
      grid.classList.remove('hidden');
      if (prompt) prompt.classList.add('hidden');
      
      urlList.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `
          <img src="${url}" alt="Preview">
          <button type="button" class="remove-btn-overlay" data-index="${index}">✕</button>
        `;
        // Handle delete on overlay
        item.querySelector('.remove-btn-overlay').onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const newList = [...urlList];
          newList.splice(index, 1);
          updateUploadPreview(prefix, newList);
        };
        grid.appendChild(item);
      });
    } else {
      grid.classList.add('hidden');
      if (prompt) prompt.classList.remove('hidden');
    }
  } else {
    // Single image logic
    const previewContainer = document.getElementById(`${prefix}-image-preview-container`) || document.getElementById(`${prefix}-banner-preview-container`);
    const previewImg = document.getElementById(`${prefix}-image-preview`) || document.getElementById(`${prefix}-banner-preview`);
    
    if (urlList.length > 0) {
      const url = urlList[0];
      if (previewImg) previewImg.src = url;
      if (previewContainer) previewContainer.classList.remove('hidden');
      if (prompt) prompt.classList.add('hidden');
    } else {
      if (previewImg) previewImg.src = '';
      if (previewContainer) previewContainer.classList.add('hidden');
      if (prompt) prompt.classList.remove('hidden');
    }
  }
}

export function setupImageUpload(prefix) {
  const dropzone = document.getElementById(`${prefix}-upload-dropzone`);
  const fileInput = document.getElementById(`${prefix}-image-file`) || document.getElementById(`${prefix}-banner-file`);
  const removeBtn = document.getElementById(`remove-${prefix}-image`) || document.getElementById(`remove-${prefix}-banner`);
  const progressBar = document.getElementById(`${prefix}-upload-progress`);
  const prompt = dropzone.querySelector('.dropzone-prompt');
  
  if (!dropzone || !fileInput) return;

  const isMultiple = fileInput.hasAttribute('multiple');

  // Handle Drag & Drop styling
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  // Handle drop file
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  });

  // Handle file select click
  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0) {
      handleFiles(fileInput.files);
    }
  });

  // Handle remove button (for single upload)
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.value = '';
      updateUploadPreview(prefix, '');
    });
  }

  async function handleFiles(files) {
    let currentUrls = [];
    if (isMultiple) {
      const hiddenMultiple = document.getElementById(`${prefix}-images`);
      if (hiddenMultiple && hiddenMultiple.value) {
        try {
          currentUrls = JSON.parse(hiddenMultiple.value);
        } catch (e) {
          currentUrls = [];
        }
      }
    }

    // Process files
    const uploadPromises = Array.from(files).map(async (file) => {
      if (!file.type.startsWith('image/')) {
        alert(`Skipping ${file.name}: Only image files are allowed.`);
        return null;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`Skipping ${file.name}: Exceeds 5MB limit.`);
        return null;
      }

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
          resolve(reader.result);
        };
      });
    });

    const base64Images = (await Promise.all(uploadPromises)).filter(Boolean);
    if (base64Images.length === 0) return;

    // Show loading spinner
    if (progressBar) progressBar.classList.remove('hidden');
    if (prompt && !isMultiple) prompt.classList.add('hidden');

    try {
      const uploadedUrls = [];
      for (const base64Data of base64Images) {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data })
        });

        if (response.ok) {
          const result = await response.json();
          uploadedUrls.push(result.url);
        } else {
          alert('One of the uploads failed.');
        }
      }

      if (uploadedUrls.length > 0) {
        if (isMultiple) {
          const newUrls = [...currentUrls, ...uploadedUrls];
          updateUploadPreview(prefix, newUrls);
        } else {
          updateUploadPreview(prefix, uploadedUrls[0]);
        }
      }
    } catch (error) {
      console.error('Upload request error:', error);
      alert('Failed to connect to the server to upload the image(s).');
    } finally {
      if (progressBar) progressBar.classList.add('hidden');
      fileInput.value = ''; // Reset input
    }
  }
}

/* =========================================================
   ENTERPRISE DMS SCRIPT
   Description: Manages modals, file previews, sharing, uploads, and UI interactions
                for a Google Drive-integrated document management system.
   ========================================================= */

/* ------------------------- CONSTANTS ------------------------- */
const CLIENT_ID = '246107059333-ouui971jmj2avu0bvfc2al6u3ql2aj0l.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBRiEHyLj68UIm2Nt4NmWg62QnOyJ_EunQ';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile';
const FILE_TYPE_MAP = {
  'application/pdf': ['fa-file-pdf', 'icon-pdf', 'PDF'],
  'application/vnd.ms-powerpoint': ['fa-file-powerpoint', 'icon-powerpoint', 'PowerPoint'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['fa-file-powerpoint', 'icon-powerpoint', 'PowerPoint'],
  'application/vnd.ms-excel': ['fa-file-excel', 'icon-excel', 'Excel'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['fa-file-excel', 'icon-excel', 'Excel'],
  'application/msword': ['fa-file-word', 'icon-word', 'Word'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['fa-file-word', 'icon-word', 'Word'],
  'application/vnd.google-apps.document': ['fa-file-word', 'icon-google-doc', 'Google Doc'],
  'application/vnd.google-apps.folder': ['fa-folder', 'icon-folder', 'Folder'],
};

/* ------------------------- GLOBAL VARIABLES ------------------------- */
let tokenClient; // Google Identity Services token client
let gapiInited = false; // Flag for Google API client initialization
let gisInited = false; // Flag for Google Identity Services initialization
let currentFolderId = 'root'; // Currently viewed folder ID
let parentFolderId = null; // Parent folder ID of current folder
let previewFileId = null; // File ID for preview modal
let previewFileName = ''; // File name for preview modal
let previewMimeType = ''; // MIME type for preview modal
let currentSharedFileId = null; // File ID for sharing
let currentSharedFileName = null; // File name for sharing
let pendingFiles = []; // Array of pending upload files: { file, cardElements }
let currentXHR = null; // Tracks ongoing upload XMLHttpRequest

/* ------------------------- UTILITY FUNCTIONS ------------------------- */

/**
 * Closes a modal by its ID.
 * @param {string} modalId - ID of the modal to close.
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

/**
 * Returns file icon and color classes based on file extension.
 * @param {string} filename - Name of the file.
 * @returns {Array<string>} - [iconClass, colorClass]
 */
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const typeMap = {
    pdf: ['fa-file-pdf', 'icon-pdf'],
    ppt: ['fa-file-powerpoint', 'icon-powerpoint'],
    pptx: ['fa-file-powerpoint', 'icon-powerpoint'],
    xls: ['fa-file-excel', 'icon-excel'],
    xlsx: ['fa-file-excel', 'icon-excel'],
    doc: ['fa-file-word', 'icon-word'],
    docx: ['fa-file-word', 'icon-word'],
    txt: ['fa-file-alt', 'icon-default'],
    png: ['fa-file-image', 'icon-default'],
    jpg: ['fa-file-image', 'icon-default'],
    jpeg: ['fa-file-image', 'icon-default'],
    gif: ['fa-file-image', 'icon-default'],
    folder: ['fa-folder', 'icon-folder'],
  };
  return typeMap[ext] || ['fa-file-alt', 'icon-default'];
}

/**
 * Prevents default drag-and-drop behavior.
 * @param {Event} e - Drag event.
 */
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

/* ------------------------- MODAL LOGIC ------------------------- */

/**
 * Initializes modal event listeners for upload button.
 */
function initModalListeners() {
  const uploadBtn = document.getElementById('uploadBtn');
  uploadBtn?.addEventListener('click', () => {
    document.getElementById('uploadModal')?.classList.add('active');
  });
}

/* ------------------------- PREVIEW MODAL LOGIC ------------------------- */

/**
 * Opens the preview modal and displays file or folder content.
 * @param {string} filename - Name of the file/folder.
 * @param {string} fileId - Google Drive file ID.
 * @param {string} mimeType - MIME type of the file.
 */
function openPreviewModal(filename, fileId, mimeType) {
  previewFileId = fileId;
  previewFileName = filename;
  previewMimeType = mimeType;

  const loadingOverlay = document.getElementById('previewLoadingOverlay');
  loadingOverlay.style.display = 'flex';

  if (mimeType === 'application/vnd.google-apps.folder') {
    listFolderContents(fileId).finally(() => {
      loadingOverlay.style.display = 'none';
    });
    return;
  }

  // Update modal titles
  document.getElementById('previewFileName').textContent = filename;
  document.getElementById('previewTitle').textContent = filename;

  const iframe = document.getElementById('previewFrame');
  if (mimeType.startsWith('image/')) {
    const imageURL = `https://drive.google.com/uc?export=view&id=${fileId}`;
    iframe.removeAttribute('src');
    iframe.srcdoc = `
      <html><head><style>
        body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f9f9f9; }
        img { max-width: 100%; max-height: 100%; object-fit: contain; }
      </style></head><body>
        <img src="${imageURL}" alt="${filename}" />
      </body></html>`;
  } else {
    iframe.removeAttribute('srcdoc');
    iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
  }

  document.getElementById('previewModal').classList.add('active');
  loadingOverlay.style.display = 'none';
}

/* ------------------------- PREVIEW TOOLBAR ACTIONS ------------------------- */

/**
 * Initializes preview toolbar button event listeners.
 */
function initPreviewToolbarListeners() {
  // Download button
  const downloadBtn = document.getElementById('previewDownloadBtn');
  downloadBtn?.addEventListener('click', async () => {
    if (!previewFileId || !previewFileName || !previewMimeType) {
      alert('No file selected for download.');
      return;
    }

    const originalText = downloadBtn.innerHTML;
    downloadBtn.innerHTML = `<span class="spinner"></span> Downloading...`;
    downloadBtn.disabled = true;

    try {
      await downloadFile(previewFileId, previewFileName, previewMimeType);
    } catch (err) {
      console.error('Download error:', err);
      alert(`Failed to download "${previewFileName}"`);
    } finally {
      downloadBtn.innerHTML = originalText;
      downloadBtn.disabled = false;
    }
  });

  // Print button
  const printBtn = document.getElementById('previewPrintBtn');
  printBtn?.addEventListener('click', () => {
    const iframe = document.getElementById('previewFrame');
    const fileUrl = iframe?.src;

    if (!fileUrl) {
      alert('No file loaded to print.');
      return;
    }

    const newTab = window.open(fileUrl, '_blank');
    if (newTab) {
      newTab.focus();
    } else {
      alert('Please allow pop-ups to print this file.');
    }
  });

  // More options button
  const moreBtn = document.getElementById('previewMoreBtn');
  moreBtn?.addEventListener('mouseenter', () => {
    if (previewFileId && previewFileName) {
      showMoreDropdown(moreBtn, previewFileId, previewFileName);
    }
  });
}

/* ------------------------- SHARE DROPDOWN LOGIC ------------------------- */

/**
 * Displays the share dropdown near the target element.
 * @param {HTMLElement} target - Element triggering the dropdown.
 * @param {string} fileId - Google Drive file ID.
 * @param {string} fileName - File name.
 */
function showShareDropdown(target, fileId, fileName) {
  currentSharedFileId = fileId;
  currentSharedFileName = fileName;

  const rect = target.getBoundingClientRect();
  const shareDropdown = document.getElementById('shareDropdown');
  shareDropdown.style.top = `${rect.bottom + window.scrollY}px`;
  shareDropdown.style.left = `${rect.left + window.scrollX}px`;
  shareDropdown.style.display = 'block';
}

/**
 * Initializes share dropdown event listeners.
 */
function initShareDropdownListeners() {
  const shareDropdown = document.getElementById('shareDropdown');

  // Hide dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!shareDropdown.contains(e.target) && !e.target.closest('.action-btn')) {
      shareDropdown.style.display = 'none';
    }
  });

  // Hide dropdown on mouse leave
  shareDropdown.addEventListener('mouseleave', () => {
    shareDropdown.style.display = 'none';
  });

  // Share option selections
  document.querySelectorAll('.share-option').forEach((option) => {
    option.addEventListener('click', () => {
      if (!currentSharedFileId || !currentSharedFileName) return;

      const action = option.dataset.action;
      if (action === 'attachment') {
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${currentSharedFileId}?alt=media&key=${API_KEY}`;
        window.open(downloadUrl, '_blank');
      } else if (action === 'gmail') {
        const fileUrl = `https://drive.google.com/file/d/${currentSharedFileId}/view`;
        const subject = encodeURIComponent(`Shared File: ${currentSharedFileName}`);
        const body = encodeURIComponent(`Hi,\n\nHere's a file I wanted to share with you:\n\n${fileUrl}`);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
      }

      shareDropdown.style.display = 'none';
    });
  });

  // Share button hover in preview modal
  const previewShareBtn = document.getElementById('previewShareBtn');
  previewShareBtn?.addEventListener('mouseenter', () => {
    if (previewFileId && previewFileName) {
      showShareDropdown(previewShareBtn, previewFileId, previewFileName);
    }
  });
}

/* ------------------------- MORE OPTIONS DROPDOWN ------------------------- */

/**
 * Displays the more options dropdown near the target element.
 * @param {HTMLElement} target - Element triggering the dropdown.
 * @param {string} fileId - Google Drive file ID.
 * @param {string} fileName - File name.
 */
function showMoreDropdown(target, fileId, fileName) {
  const rect = target.getBoundingClientRect();
  const moreDropdown = document.getElementById('moreDropdown');
  moreDropdown.style.top = `${rect.bottom + window.scrollY}px`;
  moreDropdown.style.left = `${rect.left + window.scrollX}px`;
  moreDropdown.style.display = 'block';

  currentSharedFileId = fileId;
  currentSharedFileName = fileName;
}

/**
 * Initializes more options dropdown event listeners.
 */
function initMoreDropdownListeners() {
  const moreDropdown = document.getElementById('moreDropdown');

  // Hide dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!moreDropdown.contains(e.target) && !e.target.closest('.ellipsis-btn')) {
      moreDropdown.style.display = 'none';
    }
  });

  // Hide dropdown on mouse leave
  moreDropdown.addEventListener('mouseleave', () => {
    moreDropdown.style.display = 'none';
  });

  // More option selections
  document.querySelectorAll('.more-option').forEach((option) => {
    option.addEventListener('click', async () => {
      const action = option.dataset.action;

      if (action === 'delete') {
        const fileNameToDelete = currentSharedFileName || previewFileName;
        if (!confirm(`Are you sure you want to move "${fileNameToDelete}" to Trash?`)) return;

        const fileIdToDelete = currentSharedFileId || previewFileId;
        const originalText = option.innerHTML;

        option.classList.add('loading');
        option.innerHTML = `<span class="spinner"></span> Deleting...`;
        option.disabled = true;

        try {
          const success = await deleteFile(fileIdToDelete);
          if (success) await listFolderContents(currentFolderId);
          closeModal('previewModal');
        } catch (err) {
          console.error('Delete failed:', err);
          alert(`Failed to delete "${fileNameToDelete}"`);
        } finally {
          option.innerHTML = originalText;
          option.classList.remove('loading');
          option.disabled = false;
          moreDropdown.style.display = 'none';
        }
      } else if (action === 'details') {
        alert('Details view not implemented yet.');
        moreDropdown.style.display = 'none';
      }
    });
  });
}

/* ------------------------- UPLOAD HANDLING ------------------------- */

/**
 * Highlights the selected upload option.
 * @param {string} option - Selected upload option.
 */
function selectUploadOption(option) {
  document.querySelectorAll('.upload-option').forEach((opt) => {
    opt.style.borderColor = '#e9ecef';
  });
  const selected = document.querySelector(`.upload-option[onclick="selectUploadOption('${option}')"]`);
  if (selected) selected.style.borderColor = '#4361ee';
}

/**
 * Creates an upload card UI for a file.
 * @param {File} file - File to create card for.
 * @returns {HTMLElement} - Upload card element.
 */
function createUploadCard(file) {
  const [iconClass, colorClass] = getFileIcon(file.name);
  const card = document.createElement('div');
  card.className = 'upload-card';
  card.innerHTML = `
    <div class="file-icon ${colorClass}"><i class="fas ${iconClass}"></i></div>
    <div class="file-info">
      <div class="file-name">${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)</div>
      <div class="progress-bar"><div class="progress-fill"></div></div>
      <div class="upload-status">Ready to upload</div>
    </div>
    <div class="cancel-btn" title="Cancel upload">&times;</div>
  `;
  return card;
}

/**
 * Handles new files from drop or file input.
 * @param {FileList} files - Files to handle.
 */
function handleNewFiles(files) {
  const previewArea = document.getElementById('uploadPreviewArea');
  previewArea.innerHTML = '';
  pendingFiles = [];

  for (const file of files) {
    const card = createUploadCard(file);
    previewArea.appendChild(card);

    const progressFill = card.querySelector('.progress-fill');
    const status = card.querySelector('.upload-status');
    const cancelBtn = card.querySelector('.cancel-btn');

    cancelBtn.onclick = () => {
      card.remove();
      pendingFiles = pendingFiles.filter((p) => p.file !== file);
    };

    pendingFiles.push({ file, card, progressFill, status });
  }
}

/**
 * Uploads a single file to Google Drive with progress tracking.
 * @param {File} file - File to upload.
 * @param {HTMLElement} progressFill - Progress bar element.
 * @param {HTMLElement} status - Status text element.
 * @returns {Promise<void>}
 */
function uploadFileToDriveWithXHR(file, progressFill, status) {
  return new Promise((resolve, reject) => {
    const accessToken = gapi.auth.getToken().access_token;
    const metadata = { name: file.name, mimeType: file.type, parents: [currentFolderId] };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    currentXHR = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressFill.style.width = `${percent}%`;
        status.textContent = `Uploading... ${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.send(formData);
  });
}

/**
 * Initializes drag-and-drop and file input event listeners.
 */
function initUploadListeners() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
    dropzone?.addEventListener(event, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach((event) => {
    dropzone?.addEventListener(event, () => dropzone.classList.add('active'), false);
  });

  ['dragleave', 'drop'].forEach((event) => {
    dropzone?.addEventListener(event, () => dropzone.classList.remove('active'), false);
  });

  dropzone?.addEventListener('drop', (e) => {
    handleNewFiles(Array.from(e.dataTransfer.files));
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleNewFiles(Array.from(fileInput.files));
    }
  });

  document.getElementById('uploadFooterBtn')?.addEventListener('click', async () => {
    if (pendingFiles.length === 0) {
      alert('No files selected for upload.');
      return;
    }

    try {
      while (pendingFiles.length > 0) {
        const { file, progressFill, status, card } = pendingFiles[0];
        status.textContent = 'Uploading...';
        progressFill.style.width = '0%';

        await uploadFileToDriveWithXHR(file, progressFill, status);

        status.textContent = 'Completed';
        progressFill.style.width = '100%';

        await new Promise((resolve) => setTimeout(resolve, 500));
        card.remove();
        pendingFiles.shift();
      }

      await listFolderContents(currentFolderId);
      closeModal('uploadModal');
      fileInput.value = '';
    } catch (err) {
      console.error('Upload error:', err);
      alert('Error uploading files.');
    }
  });

  document.getElementById('uploadCancelBtn')?.addEventListener('click', () => {
    if (pendingFiles.length > 0) {
      const uploadingItem = pendingFiles[0];
      for (let i = pendingFiles.length - 1; i > 0; i--) {
        pendingFiles[i].card.remove();
        pendingFiles.splice(i, 1);
      }
    }

    fileInput.value = '';
    closeModal('uploadModal');
    location.reload();
  });
}

/* ------------------------- GOOGLE DRIVE INTEGRATION ------------------------- */

/**
 * Initializes Google API client.
 */
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;

    const savedToken = localStorage.getItem('google_access_token');
    if (savedToken) {
      gapi.auth.setToken({ access_token: savedToken });
      const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${savedToken}` },
      }).then((res) => res.json());

      const userName = userInfo.name || 'User';
      const initials = userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

      document.getElementById('userName').textContent = userName;
      document.getElementById('userAvatar').textContent = initials;
      await listDriveFiles();
    }
  });
}

/**
 * Initializes Google Identity Services.
 */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
}

/**
 * Handles Google Drive OAuth login and file listing.
 */
window.handleScriptJsLogic = async function () {
  if (!gapiInited || !gisInited) {
    alert('Google Drive SDK not loaded properly.');
    return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error) {
      console.error('Token Error:', resp);
      return;
    }

    const accessToken = gapi.auth.getToken().access_token;
    localStorage.setItem('google_access_token', accessToken);

    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await res.json();

      const fullName = userInfo.name || 'User';
      const initials = (userInfo.given_name?.[0] || '') + (userInfo.family_name?.[0] || '');

      document.getElementById('userName').textContent = fullName;
      document.getElementById('userAvatar').textContent = initials.toUpperCase();

      currentFolderId = 'root';
      parentFolderId = null;
      document.getElementById('backButtonContainer').style.display = 'none';
      await listFiles();
      await listDriveFiles();
      closeModal('uploadModal');
    } catch (err) {
      console.error('Failed to fetch user info:', err);
    }
  };

  tokenClient.requestAccessToken({ prompt: 'consent' });
};

/* ------------------------- DRIVE FILE MANAGEMENT ------------------------- */

/**
 * Navigates back to parent folder or root.
 */
async function goBack() {
  const overlay = document.getElementById('backLoadingOverlay');
  overlay.style.display = 'flex';

  try {
    if (parentFolderId) {
      await listFolderContents(parentFolderId);
    } else {
      currentFolderId = 'root';
      parentFolderId = null;
      await listDriveFiles();
    }

    document.getElementById('backButtonContainer').style.display =
      !parentFolderId || currentFolderId === 'root' ? 'none' : 'block';
  } catch (error) {
    console.error('Error during back navigation:', error);
  } finally {
    overlay.style.display = 'none';
  }
}

/**
 * Downloads a file from Google Drive.
 * @param {string} fileId - File ID.
 * @param {string} fileName - File name.
 * @param {string} mimeType - MIME type.
 */
async function downloadFile(fileId, fileName, mimeType) {
  try {
    const response = await gapi.client.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'blob' }
    );

    const blob = new Blob([response.body], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading file:', error);
    alert('Failed to download file. Please try again.');
  }
}

/**
 * Moves a file to trash.
 * @param {string} fileId - File ID.
 * @returns {Promise<boolean>} - Success status.
 */
async function deleteFile(fileId) {
  try {
    await gapi.client.drive.files.update({ fileId, trashed: true });
    console.log(`File ${fileId} moved to trash.`);
    return true;
  } catch (error) {
    console.error('Error trashing file:', error);
    alert('Failed to move file to trash.');
    return false;
  }
}

/**
 * Lists files in a specific folder.
 * @param {string} folderId - Folder ID.
 */
async function listFolderContents(folderId) {
  try {
    const folderRes = await gapi.client.drive.files.get({
      fileId: folderId,
      fields: 'parents',
    });

    parentFolderId = folderRes.result.parents?.[0] || null;
    currentFolderId = folderId;
    document.getElementById('backButtonContainer').style.display = 'block';

    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
    });

    renderDriveFiles(document.getElementById('drive-documents-section'), res.result.files || []);
  } catch (error) {
    console.error('Error fetching folder contents:', error);
  }
}

/**
 * Lists files in the root folder.
 */
async function listDriveFiles() {
  try {
    const res = await gapi.client.drive.files.list({
      q: "'root' in parents and trashed=false",
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
    });

    parentFolderId = null;
    currentFolderId = 'root';
    document.getElementById('backButtonContainer').style.display = 'none';
    renderDriveFiles(document.getElementById('drive-documents-section'), res.result.files || []);
  } catch (error) {
    console.error('Error fetching files:', error.message || JSON.stringify(error));
  }
}

/* ------------------------- FILE SYNC ------------------------- */

/**
 * Lists and syncs files to the backend.
 */
async function listFiles() {
  try {
    console.log('📂 Fetching files from Google Drive...');
    const response = await gapi.client.drive.files.list({
      pageSize: 1000,
      fields: 'files(id, name, mimeType, size, parents, createdTime, webViewLink)',
    });

    const files = response.result.files || [];
    if (!files.length) {
      console.warn('⚠️ No files found in Drive.');
      return;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        console.log('📁 Sending folder:', file.name);
        await window.sendToBackend(file);
      }
    }

    await sleep(2000);

    for (const file of files) {
      if (file.mimeType !== 'application/vnd.google-apps.folder') {
        console.log('📄 Sending file:', file.name);
        await window.sendToBackend(file);
      }
    }

    console.log('✅ All files uploaded to backend.');
  } catch (err) {
    console.error('❌ Error fetching files:', err.message);
  }
}

/**
 * Sends file metadata to the backend.
 * @param {Object} file - File metadata.
 */
window.sendToBackend = async function (file) {
  const payload = {
    drive_id: file.id,
    title: file.name,
    file_type: file.mimeType,
    file_size: file.size || 0,
    folder_id: file.parents ? file.parents[0] : null,
    uploaded_by: 1,
    upload_date: file.createdTime,
    file_url: file.webViewLink,
    tags: '',
  };

  console.log('⬆️ Sending to backend:', payload.title);

  try {
    const res = await fetch('http://localhost:8000/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('❌ Backend error:', await res.text());
    } else {
      console.log('✅ Uploaded:', payload.title);
    }
  } catch (err) {
    console.error('❌ Failed to send to backend:', err);
  }
};

/* ------------------------- RENDERING FILES ------------------------- */

/**
 * Renders Drive files/folders into a container.
 * @param {HTMLElement} container - Container element.
 * @param {Array} files - List of files.
 * @param {boolean} isTrashView - Whether in trash view mode.
 */
function renderDriveFiles(container, files, isTrashView = false) {
  container.innerHTML = '';

  files.forEach((file) => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const formattedDate = new Date(file.modifiedTime).toLocaleDateString();
    const fileSize = file.size && !isFolder ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—';
    const [iconClass, colorClass, tagLabel] = FILE_TYPE_MAP[file.mimeType] || ['fa-file-alt', 'icon-default', 'File'];

    const card = document.createElement('div');
    card.className = 'document-card';
    card.innerHTML = `
      <div class="document-preview">
        <i class="fa-solid ${iconClass} file-icon ${colorClass}"></i>
        <div class="preview-overlay">
          <button class="btn btn-outline preview-btn" data-id="${file.id}" data-name="${file.name}" data-mime="${file.mimeType}">
            <i class="fas fa-eye"></i> Preview
          </button>
        </div>
      </div>
      <div class="document-info">
        <h3>${file.name}</h3>
        <div class="document-meta">
          <span>${fileSize}</span>
          <span>${formattedDate}</span>
        </div>
        <div class="document-tags">
          <span class="tag">${tagLabel}</span>
        </div>
        <div class="document-actions">
          ${
            isTrashView
              ? `
            <button class="action-btn restore-btn" data-id="${file.id}" data-name="${file.name}">
              <i class="fas fa-undo"></i> Restore
            </button>
            <button class="action-btn delete-btn" data-id="${file.id}" data-name="${file.name}">
              <i class="fas fa-trash"></i> Delete
            </button>`
              : `
            ${!isFolder ? `
              <button class="action-btn download-btn" data-id="${file.id}" data-name="${file.name}" data-mime="${file.mimeType}">
                <i class="fas fa-download"></i> Download
              </button>` : ''}
            <button class="action-btn"><i class="fas fa-share"></i> Share</button>
            <button class="action-btn ellipsis-btn"><i class="fas fa-ellipsis-h"></i></button>`
          }
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  if (isTrashView) {
    container.querySelectorAll('.restore-btn')?.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fileId = btn.dataset.id;
        const fileName = btn.dataset.name;
        const originalText = btn.innerHTML;

        btn.innerHTML = `<span class="spinner"></span> Restoring...`;
        btn.disabled = true;

        try {
          await gapi.client.drive.files.update({ fileId, trashed: false });
          alert(`Restored "${fileName}"`);
          listTrashedFiles();
        } catch (err) {
          console.error('Restore failed:', err);
          alert(`Failed to restore "${fileName}"`);
        } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('.delete-btn')?.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fileId = btn.dataset.id;
        const fileName = btn.dataset.name;
        const originalText = btn.innerHTML;

        if (!confirm(`Are you sure you want to permanently delete "${fileName}"? This cannot be undone.`)) return;

        btn.innerHTML = `<span class="spinner"></span> Deleting...`;
        btn.disabled = true;

        try {
          await gapi.client.drive.files.delete({ fileId });
          alert(`Permanently deleted "${fileName}"`);
          listTrashedFiles();
        } catch (err) {
          console.error('Permanent delete failed:', err);
          alert(`Failed to permanently delete "${fileName}"`);
        } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      });
    });
  }

  container.querySelectorAll('.preview-btn')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      openPreviewModal(btn.dataset.name, btn.dataset.id, btn.dataset.mime);
    });
  });

  container.querySelectorAll('.download-btn')?.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fileId = btn.dataset.id;
      const fileName = btn.dataset.name;
      const mimeType = btn.dataset.mime;
      const originalText = btn.innerHTML;

      btn.innerHTML = `<span class="spinner"></span> Downloading...`;
      btn.disabled = true;

      try {
        await downloadFile(fileId, fileName, mimeType);
      } catch (err) {
        console.error('Download failed:', err);
        alert(`Failed to download "${fileName}"`);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.document-actions .action-btn')?.forEach((btn) => {
    if (btn.innerHTML.includes('fa-share')) {
      const card = btn.closest('.document-card');
      const fileId = card.querySelector('.preview-btn')?.dataset.id;
      const fileName = card.querySelector('.preview-btn')?.dataset.name;

      btn.addEventListener('mouseenter', () => {
        showShareDropdown(btn, fileId, fileName);
      });

      btn.addEventListener('mouseleave', () => {
        setTimeout(() => {
          if (!document.getElementById('shareDropdown').matches(':hover')) {
            document.getElementById('shareDropdown').style.display = 'none';
          }
        }, 150);
      });
    }
  });

  container.querySelectorAll('.document-actions .ellipsis-btn')?.forEach((btn) => {
    const card = btn.closest('.document-card');
    const fileId = card.querySelector('.preview-btn')?.dataset.id;
    const fileName = card.querySelector('.preview-btn')?.dataset.name;

    btn.addEventListener('mouseenter', () => {
      showMoreDropdown(btn, fileId, fileName);
    });

    btn.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!document.getElementById('moreDropdown').matches(':hover')) {
          document.getElementById('moreDropdown').style.display = 'none';
        }
      }, 150);
    });
  });
}

/* ------------------------- TRASH VIEW MANAGEMENT ------------------------- */

/**
 * Lists trashed files.
 */
async function listTrashedFiles() {
  try {
    document.getElementById('backButtonContainer').style.display = 'none';
    const res = await gapi.client.drive.files.list({
      q: 'trashed=true',
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      pageSize: 100,
    });

    const files = res.result.files || [];
    const container = document.getElementById('drive-documents-section');
    container.innerHTML = files.length === 0 ? '<p>No files in Trash.</p>' : '';
    renderDriveFiles(container, files, true);
  } catch (error) {
    console.error('Error fetching trashed files:', error);
  }
}

/* ------------------------- SIDEBAR AND MENU ------------------------- */

/**
 * Toggles the sidebar menu.
 */
function toggleMenu() {
  document.querySelector('.sidebar')?.classList.toggle('active');
}

/**
 * Initializes sidebar menu event listeners.
 */
function initSidebarListeners() {
  const trashMenuItem = document.getElementById('trashMenuItem');
  trashMenuItem?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar .menu-item').forEach((item) => item.classList.remove('active'));
    trashMenuItem.classList.add('active');
    listTrashedFiles();
  });

  const dashboardMenuItem = document.querySelector('.menu-item[href="#"]');
  dashboardMenuItem?.addEventListener('click', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar .menu-item').forEach((item) => item.classList.remove('active'));
    dashboardMenuItem.classList.add('active');
    parentFolderId = null;
    currentFolderId = 'root';
    document.getElementById('backButtonContainer').style.display = 'none';
    await listDriveFiles();
  });

  document.getElementById('backButton')?.addEventListener('click', goBack);
}

/* ------------------------- SEARCH FUNCTIONALITY ------------------------- */

/**
 * Initializes search functionality.
 */
function initSearchListeners() {
  const searchInput = document.getElementById('searchInput');
  const documentsContainer = document.getElementById('drive-documents-section');
  const searchStatus = document.getElementById('searchStatus');

  async function searchDriveFiles(query) {
    if (!query) {
      await listDriveFiles();
      return;
    }

    searchStatus.style.display = 'block';
    try {
      const res = await gapi.client.drive.files.list({
        q: `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
        pageSize: 100,
      });

      renderDriveFiles(documentsContainer, res.result.files || []);
    } catch (error) {
      console.error('Drive search failed:', error);
      documentsContainer.innerHTML = `<p>Error searching files.</p>`;
    } finally {
      searchStatus.style.display = 'none';
    }
  }

  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim().toLowerCase();
    if (currentFolderId === 'root') {
      await searchDriveFiles(query);
    } else {
      const documentCards = documentsContainer.querySelectorAll('.document-card');
      documentCards.forEach((card) => {
        const name = card.querySelector('h3')?.textContent.toLowerCase() || '';
        card.style.display = name.includes(query) ? 'block' : 'none';
      });
    }
  });
}

/* ------------------------- LOGOUT ------------------------- */

/**
 * Initializes logout button listener.
 */
function initLogoutListener() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('google_access_token');
    gapi.auth.setToken(null);
    document.getElementById('userName').textContent = 'Guest';
    document.getElementById('userAvatar').textContent = '--';
    document.getElementById('drive-documents-section').innerHTML = '';
  });
}

/* ------------------------- INITIALIZATION ------------------------- */

/**
 * Initializes all event listeners and Google services.
 */
function initialize() {
  initModalListeners();
  initPreviewToolbarListeners();
  initShareDropdownListeners();
  initMoreDropdownListeners();
  initUploadListeners();
  initSidebarListeners();
  initSearchListeners();
  initLogoutListener();
  gapiLoaded();
  gisLoaded();
}

document.addEventListener('DOMContentLoaded', initialize);
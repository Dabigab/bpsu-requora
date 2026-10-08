/* ReQuora — report a lost / found item */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let selectedFile = null;
let previewUrl = null;

const $ = (id) => document.getElementById(id);

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentType() {
  return document.querySelector('input[name="type"]:checked').value;
}

// Wording follows the chosen type so the form always reads naturally.
function applyTypeWording() {
  const lost = currentType() === 'lost';
  $('location-label').textContent = lost ? 'Location last seen' : 'Location found';
  $('date-label').textContent = lost ? 'Date lost' : 'Date found';
  $('location').placeholder = lost ? 'e.g. Main Library, 2nd floor reading area' : 'e.g. Canteen, table near the entrance';
  $('form-title').textContent = lost ? 'Report a lost item' : 'Report a found item';
  document.title = `${lost ? 'Report a lost item' : 'Report a found item'} — ReQuora`;
  $('label-lost').classList.toggle('selected', lost);
  $('label-found').classList.toggle('selected', !lost);
}

/* ---------- Photo ---------- */
function formatBytes(n) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function clearPhoto() {
  selectedFile = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('image').value = '';
  $('dropzone-preview').hidden = true;
  $('dropzone-empty').hidden = false;
  $('dropzone').classList.remove('has-file');
}

function setPhoto(file) {
  const form = $('report-form');
  const old = form.querySelector('#err-image');
  if (old) old.remove();

  if (!file) return;
  let problem = '';
  if (!IMAGE_TYPES.includes(file.type)) problem = 'Please choose a JPG, PNG, WEBP or GIF image.';
  else if (file.size > MAX_IMAGE_BYTES) problem = `That photo is ${formatBytes(file.size)}. The limit is 5 MB.`;

  if (problem) {
    clearPhoto();
    const p = document.createElement('p');
    p.className = 'field-error';
    p.id = 'err-image';
    p.setAttribute('role', 'alert');
    p.innerHTML = `${icon('alert', 14)}<span>${escapeHtml(problem)}</span>`;
    $('dropzone').insertAdjacentElement('afterend', p);
    return;
  }

  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('preview-img').src = previewUrl;
  $('preview-name').textContent = file.name;
  $('preview-size').textContent = formatBytes(file.size);
  $('dropzone-empty').hidden = true;
  $('dropzone-preview').hidden = false;
  $('dropzone').classList.add('has-file');
}

function wireDropzone() {
  const zone = $('dropzone');
  const input = $('image');
  input.addEventListener('change', () => setPhoto(input.files[0]));
  $('remove-photo').addEventListener('click', clearPhoto);

  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragging');
    })
  );
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) setPhoto(file);
  });
}

/* ---------- Validation (the server checks everything again) ---------- */
function validate(values) {
  const errors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const location = values.location.trim();

  if (title.length < 3) errors.title = 'Please give the item a name (at least 3 characters).';
  if (!values.category) errors.category = 'Please choose a category.';
  if (description.length < 10) errors.description = 'Please describe the item in at least 10 characters.';
  if (location.length < 3) errors.location = 'Please say where it happened (at least 3 characters).';
  if (!values.date) errors.date = 'Please choose a date.';
  else if (values.date > todayLocal()) errors.date = 'The date cannot be in the future.';
  return errors;
}

function showSuccess(item, type) {
  const lost = type === 'lost';
  $('report-form').hidden = true;
  document.querySelector('.report-aside').hidden = true;
  const box = $('report-success');
  box.hidden = false;
  box.innerHTML = `
    <div class="success-card" role="status">
      <span class="success-icon">${icon('checkCircle', 40)}</span>
      <h2>Report submitted successfully!</h2>
      <p>Your item has been added to ReQuora.</p>
      <p class="muted">Reference number <strong>${escapeHtml(item.reference)}</strong>. The office will verify your report shortly. ${
        lost ? 'We will show it to anyone who finds a match.' : 'Please hand the item to the Lost &amp; Found Office so the owner can collect it.'
      }</p>
      <div class="inline-actions center">
        <a class="btn btn-primary" href="${escapeHtml(itemUrl(item.id))}" data-item-id="${escapeHtml(item.id)}">View my report</a>
        <a class="btn btn-outline" href="report.html?type=${lost ? 'lost' : 'found'}">Report another item</a>
        <a class="btn btn-ghost" href="dashboard.html">Go to dashboard</a>
      </div>
    </div>`;
  box.querySelector('a').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFieldErrors(form);
  setFormMessage($('form-msg'), '');

  const values = Object.fromEntries(new FormData(form).entries());
  const errors = validate(values);
  if (Object.keys(errors).length) {
    showFieldErrors(form, errors);
    setFormMessage($('form-msg'), 'Please fix the highlighted fields.', 'error');
    return;
  }

  const body = new FormData();
  ['type', 'title', 'category', 'description', 'location', 'date', 'time', 'additionalDetails', 'contactInfo'].forEach((k) => {
    const v = (values[k] || '').toString().trim();
    if (v) body.append(k, v);
  });
  if (selectedFile) body.append('image', selectedFile);

  const btn = $('submit-btn');
  setLoading(btn, true, 'Submitting…');
  try {
    const data = await apiRequest('/items', { method: 'POST', auth: true, isForm: true, body });
    showSuccess(data.item, values.type);
  } catch (err) {
    setLoading(btn, false);
    const orphan = showFieldErrors(form, err.fields);
    setFormMessage($('form-msg'), orphan[0] || err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initLayout('report');
  if (!requireLogin()) return;

  const wanted = new URLSearchParams(window.location.search).get('type');
  if (wanted === 'found' || wanted === 'lost') document.querySelector(`input[name="type"][value="${wanted}"]`).checked = true;

  $('date').max = todayLocal();
  $('date').value = todayLocal();
  applyTypeWording();
  document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', applyTypeWording));

  const meta = await loadMeta();
  fillCategorySelect($('category'), meta.categories || FALLBACK_CATEGORIES, { placeholder: 'Select a category' });

  $('description').addEventListener('input', () => {
    $('description-count').textContent = $('description').value.length;
  });

  wireDropzone();
  $('report-form').addEventListener('submit', onSubmit);
});

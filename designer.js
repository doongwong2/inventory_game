const $ = (selector) => document.querySelector(selector);
const CATEGORIES = ['stationery', 'academic', 'food', 'work', 'club', 'misc'];
const ACTIVITIES = ['lecture', 'work', 'club', 'study', 'random'];
const NPCS = ['mai', 'kenji', 'rin', 'hiro', 'sora'];
let content;
let selectedItem = null;
let selectedEvent = null;
let dirty = false;
let spritePreviewOn = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const itemEntries = () => Object.entries(content.items);
const itemLabel = (key) => content.items[key]?.name || title(key);
const colorHex = (color) => `#${Math.max(0, Number(color) || 0).toString(16).padStart(6, '0').slice(-6)}`;
const colorInt = (hex) => Number.parseInt(hex.replace('#', ''), 16) || 0;
const eventAt = (dayIndex) => content.days[dayIndex];

function setDirty(value = true) {
  dirty = value;
  $('#save-state').classList.toggle('dirty', dirty);
  $('#save-state').innerHTML = `<i></i> ${dirty ? 'UNSAVED CHANGES' : 'ALL CHANGES SAVED'}`;
  $('#save-button').disabled = !dirty;
}

function notify(message, isError = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => box.classList.remove('visible'), 4500);
}

function renderRecordLists() {
  const itemFilter = $('#item-search').value.trim().toLowerCase();
  const entries = itemEntries().filter(([key, item]) => `${key} ${item.name} ${item.category}`.toLowerCase().includes(itemFilter));
  $('#item-nav-count').textContent = String(itemEntries().length).padStart(2, '0');
  $('#items-count').textContent = `${itemEntries().length} ITEMS · ${new Set(itemEntries().map(([, item]) => item.category)).size} CATEGORIES`;
  $('#item-list').innerHTML = entries.length ? entries.map(([key, item]) => `<button class="record-button ${key === selectedItem ? 'selected' : ''}" data-item-key="${esc(key)}"><span class="record-index">${esc(key.slice(0, 2).toUpperCase())}</span><span class="record-name">${esc(item.name)}<small class="record-sub">${esc(item.category)} · ${item.shape?.length || 0} cells</small></span></button>`).join('') : '<div class="record-empty">No matching items.</div>';

  const eventFilter = $('#event-search').value.trim().toLowerCase();
  const events = content.days.map((day, index) => ({ day, index })).filter(({ day }) => `${day.day} ${day.npc} ${day.activity} ${(day.intro || []).join(' ')}`.toLowerCase().includes(eventFilter));
  $('#conversation-nav-count').textContent = String(content.days.length).padStart(2, '0');
  $('#events-count').textContent = `${content.days.length} EVENTS · ${content.days.reduce((sum, day) => sum + (day.triggers || []).length, 0)} OUTCOME PATHS`;
  $('#event-list').innerHTML = events.length ? events.map(({ day, index }) => `<button class="record-button ${index === selectedEvent ? 'selected' : ''}" data-event-index="${index}"><span class="record-index">D${String(day.day).padStart(2, '0')}</span><span class="record-name">${esc(title(day.npc))}<small class="record-sub">${esc(title(day.activity))} · ${(day.triggers || []).length} PATHS</small></span></button>`).join('') : '<div class="record-empty">No matching events.</div>';
}

function rewardOptions(selected) {
  return `<option value="">No reward</option>${itemEntries().map(([key, item]) => `<option value="${esc(key)}" ${selected === key ? 'selected' : ''}>${esc(item.name)} (${esc(key)})</option>`).join('')}`;
}

function renderItemEditor() {
  const item = content.items[selectedItem];
  const panel = $('#item-editor');
  if (!item) { panel.innerHTML = '<div class="empty">Choose an item to edit.</div>'; return; }
  const shape = new Set((item.shape || []).map(([col, row]) => `${col},${row}`));
  const width = Math.max(1, ...[...shape].map((cell) => Number(cell.split(',')[0]) + 1));
  const height = Math.max(1, ...[...shape].map((cell) => Number(cell.split(',')[1]) + 1));
  const shapeCells = Array.from({ length: 80 }, (_, index) => {
    const col = index % 8;
    const row = Math.floor(index / 8);
    const occupied = shape.has(`${col},${row}`);
    const cellStyle = occupied ? `style="background-color:${colorHex(item.color)};border-color:${colorHex(item.color)}"` : '';
    return `<button type="button" class="shape-toggle ${occupied ? 'on' : ''}" ${cellStyle} data-shape-cell="${col},${row}" aria-label="Column ${col + 1}, row ${row + 1}" aria-pressed="${occupied}"></button>`;
  }).join('');
  const rewardRows = content.days.flatMap((day, dayIndex) => day.triggers.map((trigger, triggerIndex) => ({ day, dayIndex, trigger, triggerIndex }))).map(({ day, dayIndex, trigger, triggerIndex }) => `<label class="reward-row"><span class="reward-event">Day ${day.day} · ${esc(title(day.npc))}<small>PATH ${triggerIndex + 1} · ${trigger.wantItems?.length ? trigger.wantItems.map(itemLabel).map(esc).join(' + ') : 'Fallback'}</small></span><select data-reward-day="${dayIndex}" data-reward-trigger="${triggerIndex}" aria-label="Day ${day.day} reward">${rewardOptions(trigger.receiveItem)}</select></label>`).join('');
  panel.innerHTML = `<div class="form-heading"><div><h2>${esc(item.name)}</h2><p class="helper">Item definition and story availability.</p></div><button class="delete-button" data-delete-item="${esc(selectedItem)}">Delete item</button></div>
    <div class="form-section"><h3>Item details</h3><div class="field-grid">
      <div class="field"><label for="item-key">DATA KEY</label><input id="item-key" class="key-field" value="${esc(selectedItem)}" readonly /></div>
      <div class="field"><label for="item-name">DISPLAY NAME</label><input id="item-name" data-item-field="name" value="${esc(item.name)}" maxlength="80" /></div>
      <div class="field"><label for="item-category">CATEGORY</label><select id="item-category" data-item-field="category">${CATEGORIES.map((category) => `<option value="${category}" ${item.category === category ? 'selected' : ''}>${title(category)}</option>`).join('')}</select></div>
      <div class="field"><label for="item-color">PIXEL COLOR</label><div class="field-inline"><input id="item-color" type="color" data-item-field="color" value="${colorHex(item.color)}" /><span class="small-label">${colorHex(item.color)}</span></div></div>
      <div class="field full"><label for="item-description">DESCRIPTION</label><textarea id="item-description" data-item-field="description">${esc(item.description)}</textarea></div>
    </div></div>
    <div class="form-section"><div class="form-heading"><h3>Item sprite</h3><span class="small-label">TRANSPARENT PNG · MAX 512 × 512</span></div><p class="helper">Upload one PNG sprite. It is stored with the project and referenced by this item's game data.</p><div class="sprite-controls"><button type="button" class="button button-quiet" id="upload-sprite">${item.sprite ? 'Replace sprite' : 'Upload PNG sprite'}</button>${item.sprite ? `<span class="sprite-path">${esc(item.sprite)}</span><button type="button" class="delete-button" id="clear-sprite">Remove</button>` : '<span class="sprite-path">No sprite assigned</span>'}<label class="check-row sprite-preview-toggle"><input type="checkbox" id="sprite-preview-toggle" ${item.sprite ? '' : 'disabled'} ${spritePreviewOn && item.sprite ? 'checked' : ''} /> Preview on footprint</label></div></div>
    <div class="form-section"><div class="form-heading"><h3>Grid footprint</h3><span class="small-label">${item.shape.length} CELLS · ${width} × ${height} BOUNDS</span></div><p class="helper">Edit the footprint below, or preview the sprite clipped to its occupied cells.</p><div class="shape-editor" id="shape-editor" ${spritePreviewOn && item.sprite ? 'hidden' : ''} style="--item-color:${colorHex(item.color)}" role="group" aria-label="Edit item grid footprint">${shapeCells}</div><canvas class="sprite-preview-canvas" id="sprite-preview-canvas" ${spritePreviewOn && item.sprite ? '' : 'hidden'} aria-label="Sprite clipped to item footprint"></canvas><div class="shape-caption">COLUMNS → &nbsp; ROWS ↓</div></div>
    <div class="form-section"><div class="form-heading"><h3>When does this item appear?</h3><span class="small-label">GAME SOURCES</span></div><label class="check-row"><input type="checkbox" data-starting-item="${esc(selectedItem)}" ${content.startingItems.includes(selectedItem) ? 'checked' : ''} /> In the player's starting inventory</label><p class="helper">Choose which event paths award this item. Each path currently awards at most one item.</p><div class="reward-table">${rewardRows || '<div class="record-empty">No event paths yet.</div>'}</div></div>`;
  const footprintSection = panel.querySelector('#shape-editor')?.closest('.form-section');
  footprintSection?.insertAdjacentHTML('beforeend', '<div class="template-downloads"><button type="button" class="button button-quiet" id="download-item-template">Download this PNG</button><button type="button" class="button button-quiet" id="download-all-templates">Download all footprints ZIP</button></div><p class="helper">Transparent PNG templates at 128 pixels per grid cell, with outlines around every occupied cell.</p>');
  if (spritePreviewOn && item.sprite) drawSpritePreview();
}

function renderEventEditor() {
  const day = eventAt(selectedEvent);
  const panel = $('#event-editor');
  if (!day) { panel.innerHTML = '<div class="empty">Choose an event to edit.</div>'; return; }
  const pathMarkup = (day.triggers || []).map((trigger, triggerIndex) => `<div class="trigger-card"><div class="trigger-top"><strong>OUTCOME PATH ${triggerIndex + 1}${triggerIndex === day.triggers.length - 1 && !trigger.wantItems?.length ? ' · FALLBACK' : ''}</strong><button type="button" class="delete-button" data-delete-trigger="${triggerIndex}">Remove path</button></div>
      <div class="field-grid"><div class="field full"><span class="field-label">REQUIRED ITEMS · ALL SELECTED ITEMS MUST BE IN THE BAG</span><div class="item-choice-grid">${itemEntries().map(([key, item]) => `<label class="item-choice"><input type="checkbox" data-required-item="${esc(key)}" data-trigger-index="${triggerIndex}" ${(trigger.wantItems || []).includes(key) ? 'checked' : ''} />${esc(item.name)}</label>`).join('')}</div></div>
      <div class="field full"><span class="field-label">CONSUMED ITEMS · REMOVE ONE MATCHING ITEM FROM THE BAG WHEN THIS PATH FIRES</span><div class="item-choice-grid">${itemEntries().map(([key, item]) => `<label class="item-choice"><input type="checkbox" data-consume-item="${esc(key)}" data-trigger-index="${triggerIndex}" ${(trigger.consumeItems || []).includes(key) ? 'checked' : ''} />${esc(item.name)}</label>`).join('')}</div></div>
      <div class="field full"><label for="trigger-text-${triggerIndex}">DIALOGUE / OUTCOME TEXT</label><textarea id="trigger-text-${triggerIndex}" data-trigger-field="dialogue" data-trigger-index="${triggerIndex}">${esc(trigger.dialogue)}</textarea></div>
      <div class="field"><label for="trigger-affinity-${triggerIndex}">AFFINITY CHANGE · NEGATIVE VALUES LOSE AFFINITY</label><input id="trigger-affinity-${triggerIndex}" type="number" step="1" min="-100" max="100" data-trigger-field="affinityGain" data-trigger-index="${triggerIndex}" value="${Number(trigger.affinityGain) || 0}" /></div>
      <div class="field"><label for="trigger-reward-${triggerIndex}">ITEM REWARD</label><select id="trigger-reward-${triggerIndex}" data-trigger-field="receiveItem" data-trigger-index="${triggerIndex}">${rewardOptions(trigger.receiveItem)}</select></div></div></div>`).join('');
  panel.innerHTML = `<div class="form-heading"><div><h2>Day ${day.day} · ${esc(title(day.npc))}</h2><p class="helper">Scene dialogue, requirements, affinity changes, rewards, and outcomes.</p></div><button class="delete-button" data-delete-event="${selectedEvent}">Delete event</button></div>
    <div class="form-section"><h3>Event details</h3><div class="field-grid"><div class="field"><label for="event-day">SCHEDULE DAY</label><input id="event-day" type="number" min="1" value="${day.day}" data-event-field="day" /></div><div class="field"><label for="event-npc">CHARACTER</label><select id="event-npc" data-event-field="npc">${NPCS.map((npc) => `<option value="${npc}" ${npc === day.npc ? 'selected' : ''}>${title(npc)}</option>`).join('')}</select></div><div class="field"><label for="event-activity">BACKGROUND SCENE</label><select id="event-activity" data-event-field="activity">${ACTIVITIES.map((activity) => `<option value="${activity}" ${activity === day.activity ? 'selected' : ''}>${title(activity)}</option>`).join('')}</select></div><div class="field"><label>BACKGROUND DESCRIPTION</label><p class="helper">${esc(({lecture:'Lecture hall',work:'Campus café',club:'Rooftop garden',study:'Library',random:'Dorm hallway'})[day.activity] || 'Activity scene')} · selected by scene type</p></div><div class="field full"><label for="event-intro">INTRO DIALOGUE · ONE LINE PER ROW</label><textarea id="event-intro" data-event-lines="intro">${esc((day.intro || []).join('\n'))}</textarea></div></div></div>
    <div class="form-section"><div class="form-heading"><h3>Conditions and outcomes</h3><button type="button" class="button button-add" id="add-trigger">＋ Add path</button></div><p class="helper">The game checks paths in order and picks the first one whose required items are all present. Keep a no-item fallback as the final path.</p>${pathMarkup}</div>
    <div class="form-section"><h3>Event ending</h3><div class="field"><label for="event-outro">OUTRO DIALOGUE · ONE LINE PER ROW</label><textarea id="event-outro" data-event-lines="outro">${esc((day.outro || []).join('\n'))}</textarea></div></div>`;
}

function drawSpritePreview() {
  const item = content.items[selectedItem];
  const canvas = $('#sprite-preview-canvas');
  if (!item || !canvas || !item.sprite) return;
  const width = Math.max(...item.shape.map(([col]) => col + 1));
  const height = Math.max(...item.shape.map(([, row]) => row + 1));
  const cellSize = 24;
  canvas.width = width * cellSize;
  canvas.height = height * cellSize;
  canvas.style.width = `${width * cellSize}px`;
  canvas.style.height = `${height * cellSize}px`;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colorHex(item.color);
  for (const [col, row] of item.shape) ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
  const image = new Image();
  image.onload = () => {
    if (selectedItem !== item.key && content.items[selectedItem] !== item) return;
    ctx.save();
    ctx.beginPath();
    for (const [col, row] of item.shape) ctx.rect(col * cellSize, row * cellSize, cellSize, cellSize);
    ctx.clip();
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
    ctx.strokeStyle = '#f2eaff';
    ctx.lineWidth = 1;
    for (const [col, row] of item.shape) ctx.strokeRect(col * cellSize + .5, row * cellSize + .5, cellSize - 1, cellSize - 1);
  };
  image.onerror = () => notify('Could not load this sprite preview. Re-upload the PNG.', true);
  image.src = `/${item.sprite}?v=${encodeURIComponent(item.sprite.split('-').at(-1))}`;
}

const TEMPLATE_CELL_PIXELS = 128;

function makeFootprintTemplate(item) {
  const shape = item.shape || [];
  if (!shape.length) throw new Error(`Item “${item.name}” has no occupied cells.`);
  const width = Math.max(...shape.map(([col]) => col + 1));
  const height = Math.max(...shape.map(([, row]) => row + 1));
  const canvas = document.createElement('canvas');
  canvas.width = width * TEMPLATE_CELL_PIXELS;
  canvas.height = height * TEMPLATE_CELL_PIXELS;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#22202a';
  ctx.lineWidth = 4;
  for (const [col, row] of shape) {
    const inset = ctx.lineWidth / 2;
    ctx.strokeRect(
      col * TEMPLATE_CELL_PIXELS + inset,
      row * TEMPLATE_CELL_PIXELS + inset,
      TEMPLATE_CELL_PIXELS - ctx.lineWidth,
      TEMPLATE_CELL_PIXELS - ctx.lineWidth,
    );
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`Could not create a PNG for ${item.name}.`)), 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function templateFilename(key) {
  return `${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}-footprint.png`;
}

async function downloadItemTemplate() {
  try {
    const item = content.items[selectedItem];
    if (!item) throw new Error('Choose an item first.');
    downloadBlob(await makeFootprintTemplate(item), templateFilename(selectedItem));
    notify(`Downloaded the ${item.name} footprint template.`);
  } catch (error) { notify(error.message, true); }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStoredFiles(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const put16 = (view, offset, value) => view.setUint16(offset, value, true);
  const put32 = (view, offset, value) => view.setUint32(offset, value, true);

  for (const { name, data } of files) {
    const filename = encoder.encode(name);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + filename.length);
    const localView = new DataView(local.buffer);
    put32(localView, 0, 0x04034b50); put16(localView, 4, 20); put16(localView, 6, 0x0800);
    put16(localView, 8, 0); put32(localView, 14, checksum); put32(localView, 18, data.length); put32(localView, 22, data.length);
    put16(localView, 26, filename.length); local.set(filename, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + filename.length);
    const centralView = new DataView(central.buffer);
    put32(centralView, 0, 0x02014b50); put16(centralView, 4, 20); put16(centralView, 6, 20);
    put16(centralView, 8, 0x0800); put16(centralView, 10, 0);
    put32(centralView, 16, checksum); put32(centralView, 20, data.length); put32(centralView, 24, data.length);
    put16(centralView, 28, filename.length); put32(centralView, 42, localOffset); central.set(filename, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  put32(endView, 0, 0x06054b50); put16(endView, 8, files.length); put16(endView, 10, files.length);
  put32(endView, 12, centralSize); put32(endView, 16, localOffset);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

async function downloadAllTemplates() {
  try {
    const files = [];
    for (const [key, item] of itemEntries()) {
      const png = await makeFootprintTemplate(item);
      files.push({ name: `item-footprints/${templateFilename(key)}`, data: new Uint8Array(await png.arrayBuffer()) });
    }
    if (!files.length) throw new Error('There are no items to export.');
    downloadBlob(zipStoredFiles(files), 'item-footprint-templates.zip');
    notify(`Downloaded PNG footprint templates for ${files.length} items.`);
  } catch (error) { notify(error.message, true); }
}

function render() {
  renderRecordLists();
  renderItemEditor();
  renderEventEditor();
}

function markEdited() { setDirty(true); }

function removeItem(key) {
  delete content.items[key];
  content.startingItems = content.startingItems.filter((candidate) => candidate !== key);
  for (const day of content.days) for (const trigger of day.triggers) {
    trigger.wantItems = (trigger.wantItems || []).filter((candidate) => candidate !== key);
    trigger.consumeItems = (trigger.consumeItems || []).filter((candidate) => candidate !== key);
    if (trigger.receiveItem === key) trigger.receiveItem = null;
  }
  selectedItem = Object.keys(content.items)[0] || null;
  markEdited(); render();
}

function addItem() {
  let index = Object.keys(content.items).length + 1;
  let key = `new_item_${index}`;
  while (content.items[key]) key = `new_item_${++index}`;
  content.items[key] = { name: 'New item', color: 0xc8ed81, shape: [[0, 0]], category: 'misc', description: '' };
  selectedItem = key; markEdited(); render();
}

function addEvent() {
  const day = { day: content.days.length + 1, activity: 'random', npc: 'sora', intro: ['A new event begins.'], triggers: [{ wantItems: [], dialogue: 'The character reacts.', affinityGain: 0, receiveItem: null }], outro: ['The event ends.'] };
  content.days.push(day); selectedEvent = content.days.length - 1; markEdited(); render(); setTab('conversations');
}

function deleteEvent(index) {
  content.days.splice(index, 1);
  content.days.forEach((day, i) => { day.day = i + 1; });
  selectedEvent = content.days.length ? Math.min(index, content.days.length - 1) : null;
  markEdited(); render();
}

function setTab(tab) {
  const isItems = tab === 'items';
  document.querySelectorAll('.side-link').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $('#items-panel').hidden = !isItems;
  $('#conversations-panel').hidden = isItems;
  $('#page-eyebrow').innerHTML = isItems ? 'CONTENT EDITOR <span>01 / 02</span>' : 'NARRATIVE EDITOR <span>02 / 02</span>';
  $('#page-title').textContent = isItems ? 'Items' : 'Events';
  $('#page-description').textContent = isItems ? 'Edit item definitions, footprints, and when each item enters the game.' : 'Edit dialogue, scene backgrounds, requirements, affinity changes, rewards, and event endings.';
}

function validateContent(data) {
  if (!data || data.schemaVersion !== 1 || !data.items || !Array.isArray(data.days) || !Array.isArray(data.startingItems)) throw new Error('This file is not a supported game content file.');
  for (const [key, item] of Object.entries(data.items)) {
    if (!key.trim() || !item.name?.trim() || !Array.isArray(item.shape) || !item.shape.length) throw new Error(`Item “${key}” needs a name and at least one occupied grid cell.`);
    for (const cell of item.shape) if (!Array.isArray(cell) || cell.length !== 2 || !Number.isInteger(cell[0]) || !Number.isInteger(cell[1]) || cell[0] < 0 || cell[0] > 7 || cell[1] < 0 || cell[1] > 9) throw new Error(`Item “${key}” has a cell outside the 8 × 10 editor grid.`);
    if (item.sprite && (!item.sprite.startsWith('assets/items/') || item.sprite.includes('..'))) throw new Error(`Item “${key}” has an invalid sprite path.`);
  }
  for (const day of data.days) {
    if (!Array.isArray(day.triggers) || !day.triggers.length) throw new Error(`Day ${day.day} must have at least one outcome path.`);
    for (const trigger of day.triggers) {
      if (!Number.isFinite(Number(trigger.affinityGain))) throw new Error(`Day ${day.day} has an invalid affinity change.`);
      for (const item of trigger.wantItems || []) if (!data.items[item]) throw new Error(`Day ${day.day} requires missing item “${item}”.`);
      for (const item of trigger.consumeItems || []) if (!data.items[item]) throw new Error(`Day ${day.day} consumes missing item “${item}”.`);
      if (trigger.receiveItem && !data.items[trigger.receiveItem]) throw new Error(`Day ${day.day} rewards missing item “${trigger.receiveItem}”.`);
    }
  }
  for (const key of data.startingItems) if (!data.items[key]) throw new Error(`Starting inventory refers to missing item “${key}”.`);
  return true;
}

async function saveToProject() {
  try {
    validateContent(content);
    $('#save-button').disabled = true;
    const response = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content, null, 2) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Save failed.');
    setDirty(false); notify('Saved to data/game-content.json. Reload the game page to use the updated content.');
  } catch (error) {
    $('#save-button').disabled = false; notify(error.message, true);
  }
}

function exportJSON() {
  try {
    validateContent(content);
    const blob = new Blob([`${JSON.stringify(content, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'game-content.json'; link.click();
    URL.revokeObjectURL(link.href); notify('Exported game-content.json.');
  } catch (error) { notify(error.message, true); }
}

async function loadProjectData() {
  const response = await fetch('/api/content');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load game data.');
  validateContent(data);
  content = data;
  selectedItem = Object.keys(content.items)[0] || null;
  selectedEvent = content.days.length ? 0 : null;
  $('#save-button').disabled = false;
  $('#export-button').disabled = false;
  $('#bundle-button').disabled = false;
  $('#import-button').disabled = false;
  setDirty(false); render();
}

async function uploadSprite(file) {
  if (!file || !selectedItem) return;
  const form = new FormData();
  form.append('sprite', file);
  try {
    const response = await fetch(`/api/sprite?item=${encodeURIComponent(selectedItem)}`, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sprite upload failed.');
    content.items[selectedItem].sprite = result.sprite;
    spritePreviewOn = true;
    markEdited(); renderItemEditor(); renderRecordLists();
    notify('Sprite saved under assets/items/. Save changes to link it in game data.');
  } catch (error) { notify(error.message, true); }
}

async function exportBundle() {
  try {
    if (dirty) throw new Error('Save changes before exporting the game bundle.');
    validateContent(content);
    const response = await fetch('/api/export-bundle');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Could not create game bundle.');
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'game-content-bundle.zip'; link.click();
    URL.revokeObjectURL(link.href); notify('Exported game-content-bundle.zip.');
  } catch (error) { notify(error.message, true); }
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]'); if (tab) setTab(tab.dataset.tab);
  const item = event.target.closest('[data-item-key]'); if (item) { selectedItem = item.dataset.itemKey; spritePreviewOn = false; render(); }
  const day = event.target.closest('[data-event-index]'); if (day) { selectedEvent = Number(day.dataset.eventIndex); render(); }
  if (event.target.closest('#add-item')) addItem();
  if (event.target.closest('#add-event')) addEvent();
  if (event.target.closest('#save-button')) saveToProject();
  if (event.target.closest('#export-button')) exportJSON();
  if (event.target.closest('#bundle-button')) exportBundle();
  if (event.target.closest('#download-item-template')) downloadItemTemplate();
  if (event.target.closest('#download-all-templates')) downloadAllTemplates();
  if (event.target.closest('#import-button')) $('#import-file').click();
  if (event.target.closest('#upload-sprite')) $('#sprite-file').click();
  if (event.target.closest('#clear-sprite')) { content.items[selectedItem].sprite = ''; spritePreviewOn = false; markEdited(); renderItemEditor(); }
  if (event.target.closest('#add-trigger')) {
    const triggers = eventAt(selectedEvent).triggers;
    const path = { wantItems: [], dialogue: '', affinityGain: 0, receiveItem: null };
    const fallbackIndex = triggers.findIndex((trigger, index) => index === triggers.length - 1 && !trigger.wantItems?.length);
    triggers.splice(fallbackIndex < 0 ? triggers.length : fallbackIndex, 0, path);
    markEdited(); renderEventEditor(); renderRecordLists();
  }
  const deleteItem = event.target.closest('[data-delete-item]'); if (deleteItem) removeItem(deleteItem.dataset.deleteItem);
  const deleteDay = event.target.closest('[data-delete-event]'); if (deleteDay) deleteEvent(Number(deleteDay.dataset.deleteEvent));
  const deleteTrigger = event.target.closest('[data-delete-trigger]'); if (deleteTrigger) { eventAt(selectedEvent).triggers.splice(Number(deleteTrigger.dataset.deleteTrigger), 1); if (!eventAt(selectedEvent).triggers.length) eventAt(selectedEvent).triggers.push({ wantItems: [], dialogue: '', affinityGain: 0, receiveItem: null }); markEdited(); renderEventEditor(); renderRecordLists(); }
  const shapeCell = event.target.closest('[data-shape-cell]');
  if (shapeCell) {
    const [col, row] = shapeCell.dataset.shapeCell.split(',').map(Number);
    const shape = content.items[selectedItem].shape;
    const exists = shape.some(([x, y]) => x === col && y === row);
    if (exists && shape.length === 1) { notify('An item must occupy at least one cell.', true); return; }
    content.items[selectedItem].shape = exists ? shape.filter(([x, y]) => x !== col || y !== row) : [...shape, [col, row]];
    content.items[selectedItem].shape.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    markEdited(); renderItemEditor(); renderRecordLists();
  }
});

document.addEventListener('input', (event) => {
  const field = event.target.dataset.itemField;
  if (field && selectedItem) {
    content.items[selectedItem][field] = field === 'color' ? colorInt(event.target.value) : event.target.value;
    if (field === 'color') {
      $('#shape-editor')?.style.setProperty('--item-color', colorHex(event.target.value));
      document.querySelectorAll('#shape-editor .shape-toggle.on').forEach((cell) => {
        cell.style.backgroundColor = colorHex(event.target.value);
        cell.style.borderColor = colorHex(event.target.value);
      });
      const hexLabel = event.target.parentElement.querySelector('.small-label');
      if (hexLabel) hexLabel.textContent = colorHex(event.target.value);
      if (spritePreviewOn) drawSpritePreview();
    }
    markEdited(); if (field === 'name' || field === 'category') renderRecordLists();
  }
  const triggerField = event.target.dataset.triggerField;
  if (triggerField && selectedEvent !== null) {
    const index = Number(event.target.dataset.triggerIndex);
    eventAt(selectedEvent).triggers[index][triggerField] = triggerField === 'affinityGain' ? Number(event.target.value) : event.target.value;
    markEdited();
  }
  const eventField = event.target.dataset.eventField;
  if (eventField && selectedEvent !== null) {
    eventAt(selectedEvent)[eventField] = eventField === 'day' ? Math.max(1, Number(event.target.value) || 1) : event.target.value;
    markEdited();
  }
  const linesField = event.target.dataset.eventLines;
  if (linesField && selectedEvent !== null) { eventAt(selectedEvent)[linesField] = event.target.value.split('\n'); markEdited(); }
});

document.addEventListener('change', (event) => {
  const itemField = event.target.dataset.itemField;
  if (itemField && selectedItem) {
    content.items[selectedItem][itemField] = itemField === 'color' ? colorInt(event.target.value) : event.target.value;
    markEdited(); renderRecordLists(); renderItemEditor();
  }
  const startingItem = event.target.dataset.startingItem;
  if (startingItem) {
    content.startingItems = event.target.checked ? [...new Set([...content.startingItems, startingItem])] : content.startingItems.filter((key) => key !== startingItem);
    markEdited();
  }
  const rewardDay = event.target.dataset.rewardDay;
  if (rewardDay !== undefined) {
    const targetDay = content.days[Number(rewardDay)];
    targetDay.triggers[Number(event.target.dataset.rewardTrigger)].receiveItem = event.target.value || null;
    markEdited(); renderItemEditor(); renderRecordLists();
  }
  const requiredItem = event.target.dataset.requiredItem;
  if (requiredItem && selectedEvent !== null) {
    const trigger = eventAt(selectedEvent).triggers[Number(event.target.dataset.triggerIndex)];
    trigger.wantItems = event.target.checked ? [...new Set([...(trigger.wantItems || []), requiredItem])] : (trigger.wantItems || []).filter((key) => key !== requiredItem);
    markEdited(); renderEventEditor(); renderRecordLists();
  }
  const consumeItem = event.target.dataset.consumeItem;
  if (consumeItem && selectedEvent !== null) {
    const trigger = eventAt(selectedEvent).triggers[Number(event.target.dataset.triggerIndex)];
    trigger.consumeItems = event.target.checked ? [...new Set([...(trigger.consumeItems || []), consumeItem])] : (trigger.consumeItems || []).filter((key) => key !== consumeItem);
    markEdited();
  }
  const triggerField = event.target.dataset.triggerField;
  if (triggerField === 'receiveItem' && selectedEvent !== null) {
    eventAt(selectedEvent).triggers[Number(event.target.dataset.triggerIndex)].receiveItem = event.target.value || null;
    markEdited(); renderEventEditor(); renderItemEditor();
  }
  const eventField = event.target.dataset.eventField;
  if (eventField && selectedEvent !== null) {
    const selectedDay = eventAt(selectedEvent);
    selectedDay[eventField] = event.target.value;
    if (eventField === 'day') {
      selectedDay.day = Math.max(1, Number(event.target.value) || 1);
      content.days.sort((a, b) => a.day - b.day);
      content.days.forEach((day, index) => { day.day = index + 1; });
      selectedEvent = content.days.indexOf(selectedDay);
    }
    markEdited(); renderEventEditor(); renderRecordLists();
  }
});

$('#item-search').addEventListener('input', renderRecordLists);
$('#event-search').addEventListener('input', renderRecordLists);
$('#sprite-file').addEventListener('change', (event) => {
  uploadSprite(event.target.files?.[0]);
  event.target.value = '';
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'sprite-preview-toggle') {
    spritePreviewOn = event.target.checked;
    $('#shape-editor').hidden = spritePreviewOn;
    $('#sprite-preview-canvas').hidden = !spritePreviewOn;
    if (spritePreviewOn) drawSpritePreview();
  }
});
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const imported = JSON.parse(await file.text()); validateContent(imported);
    content = imported; selectedItem = Object.keys(content.items)[0] || null; selectedEvent = content.days.length ? 0 : null;
    markEdited(); render(); notify('Imported data into the editor. Save changes to replace the project data file.');
  } catch (error) { notify(error.message, true); }
  event.target.value = '';
});
window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

loadProjectData().catch((error) => {
  $('#save-state').innerHTML = '<i></i> DATA LOAD FAILED';
  notify(`${error.message} Start the Go editor from the project folder.`, true);
});

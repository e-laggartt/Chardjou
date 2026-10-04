const API_URL = 'https://script.google.com/macros/s/AKfycbzfzJa5q2a5Bab1x9LVC3iIosg6RyeKIVADQAvKn1XXTZ4OIVFkiBBOkg5hMdL0hRQf/exec';

const NAME_MAX_DESKTOP = 16;
const NAME_MIN_DESKTOP = 10;
const NAME_MAX_MOBILE = 18;
const NAME_MIN_MOBILE = 12;
const TOTAL_SEATS_PER_PERIOD = 30;

// Ограничения зума
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.25;

const MONTHS_NOM = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAYS_WEEK = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

let currentPeriod = '5';
let allSeats = [];
let editingSeat = null;
let searchQuery = '';

// Зум
let baseScale = 1;
let userZoom = 1;
let panX = 0, panY = 0;

const grid = document.getElementById('seatsGrid');
const overlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const inputName = document.getElementById('inputName');
const inputComment = document.getElementById('inputComment');
const inputBdayDay = document.getElementById('inputBdayDay');
const inputBdayMonth = document.getElementById('inputBdayMonth');
const btnSave = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const modalError = document.getElementById('modalError');
const classroom = document.getElementById('classroom');
const classroomScale = document.getElementById('classroomScale');
const classroomWrap = document.getElementById('classroomWrap');
const classroomOuter = document.getElementById('classroomOuter');
const toast = document.getElementById('toast');
const seatsCounter = document.getElementById('seatsCounter');
const boardDate = document.getElementById('boardDate');
const searchInput = document.getElementById('searchInput');
const birthdayBanner = document.getElementById('birthdayBanner');
const birthdayLayer = document.getElementById('birthdayLayer');

const listOverlay = document.getElementById('listOverlay');
const listContent = document.getElementById('listContent');
const listSub = document.getElementById('listSub');
const listTitle = document.getElementById('listTitle');
const listBtn = document.getElementById('listBtn');
const listClose = document.getElementById('listClose');

const tooltip = document.getElementById('tooltip');
const ttName = document.getElementById('ttName');
const ttComment = document.getElementById('ttComment');
const ttBday = document.getElementById('ttBday');

const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

// ====== ДАТА НА ДОСКЕ ======
function formatDate(d) {
  return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ', ' + DAYS_WEEK[d.getDay()];
}
function setBoardDate() {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth();
  let text;
  if (day === 3 && month === 8) {
    text = '3 сентября, среда';
  } else {
    text = formatDate(today);
  }
  boardDate.textContent = text;
}

// ====== ЗАПОЛНЕНИЕ ВЫПАДАШЕК ======
function fillBdaySelects() {
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = d;
    inputBdayDay.appendChild(opt);
  }
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement('option');
    opt.value = String(m + 1);
    opt.textContent = MONTHS_NOM[m];
    inputBdayMonth.appendChild(opt);
  }
}

// ====== СЧЁТЧИК ======
function updateCounter() {
  const taken = currentSeats().length;
  seatsCounter.innerHTML = 'Занято <b>' + taken + '</b> из ' + TOTAL_SEATS_PER_PERIOD + ' мест';
}
function currentSeats() {
  return allSeats.filter(s => s.period === currentPeriod);
}
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ====== МАСШТАБИРОВАНИЕ И ЗУМ ======
function computeBaseScale() {
  const availW = classroomScale.clientWidth - 8;
  const CLASS_W = 1040;
  return availW < CLASS_W ? availW / CLASS_W : 1;
}

function clampPan() {
  const wrapW = classroomWrap.clientWidth;
  const wrapH = classroomWrap.clientHeight;
  const totalScale = baseScale * userZoom;
  const realW = classroom.offsetWidth * totalScale;
  const realH = classroom.offsetHeight * totalScale;

  const maxX = Math.max(0, realW - wrapW);
  const maxY = Math.max(0, realH - wrapH);

  panX = Math.min(0, Math.max(-maxX, panX));
  panY = Math.min(0, Math.max(-maxY, panY));
}

function applyTransform() {
  const total = baseScale * userZoom;
  classroom.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + total + ')';
  const realH = classroom.offsetHeight;
  classroomScale.style.height = (realH * total) + 'px';
}

function fitClassroom() {
  baseScale = computeBaseScale();
  clampPan();
  applyTransform();
}

window.addEventListener('resize', () => {
  fitClassroom();
  renderAll();
  renderBirthdayForCurrentRow();
});

// ====== ЗУМ: КНОПКИ ======
document.getElementById('zoomIn').addEventListener('click', () => {
  userZoom = Math.min(ZOOM_MAX, userZoom + ZOOM_STEP);
  clampPan();
  applyTransform();
});
document.getElementById('zoomOut').addEventListener('click', () => {
  userZoom = Math.max(ZOOM_MIN, userZoom - ZOOM_STEP);
  clampPan();
  applyTransform();
});
document.getElementById('zoomReset').addEventListener('click', () => {
  userZoom = 1;
  panX = 0; panY = 0;
  applyTransform();
});

// ====== ЗУМ: PINCH-TO-ZOOM И ПАN ======
(function initZoomGestures() {
  const el = classroomOuter;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let panStart = null;

  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = getDistance(e.touches[0], e.touches[1]);
      pinchStartZoom = userZoom;
      panStart = null;
    } else if (e.touches.length === 1 && userZoom > 1.001) {
      panStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        px: panX,
        py: panY
      };
    }
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      if (pinchStartDist > 0) {
        const factor = dist / pinchStartDist;
        let newZoom = pinchStartZoom * factor;
        newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
        if (Math.abs(newZoom - userZoom) > 0.01) {
          userZoom = newZoom;
          clampPan();
          applyTransform();
          e.preventDefault();
        }
      }
    } else if (e.touches.length === 1 && panStart && userZoom > 1.001) {
      const dx = e.touches[0].clientX - panStart.x;
      const dy = e.touches[0].clientY - panStart.y;
      panX = panStart.px + dx;
      panY = panStart.py + dy;
      clampPan();
      applyTransform();
      e.preventDefault();
    }
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDist = 0;
    if (e.touches.length < 1) panStart = null;
  });
})();

// ====== КНОПКИ ПЕРИОДОВ ======
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    renderAll();
    checkBirthdays();
  });
});

// ====== ПОИСК ======
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  applySearchHighlight();
});
function applySearchHighlight() {
  const seats = document.querySelectorAll('.seat');
  seats.forEach(el => el.classList.remove('dimmed', 'highlighted'));
  if (!searchQuery) return;
  seats.forEach(el => {
    const nameEl = el.querySelector('.seat-name');
    if (!nameEl) { el.classList.add('dimmed'); return; }
    const text = (nameEl.textContent || '').toLowerCase();
    if (text.indexOf(searchQuery) >= 0) el.classList.add('highlighted');
    else el.classList.add('dimmed');
  });
}

// ====== GOOGLE ======
async function fetchAllSeats() {
  const res = await fetch(API_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  const arr = Array.isArray(data) ? data : [];
  return arr.filter(item => !(item && item.type === 'flowers'));
}
async function pushAllSeats(seats) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ seats: seats })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.result !== 'ok') throw new Error(data.message || 'Ошибка сохранения');
}
function buildPayload() {
  return allSeats;
}

// ====== СТАРТ ======
async function initialLoad() {
  renderAll();
  try {
    const raw = await fetchAllSeats();
    allSeats = raw;
    renderAll();
    checkBirthdays();
  } catch (err) {
    console.warn('Не удалось загрузить:', err.message);
    showToast('Не удалось загрузить данные. Обновите страницу.');
  }
}

// ====== СОХРАНЕНИЕ ======
async function saveSeatOptimistic(newSeat) {
  const prevAll = allSeats.map(s => ({ ...s }));
  const idx = allSeats.findIndex(s =>
    s.period === newSeat.period && s.row === newSeat.row && s.desk === newSeat.desk && s.side === newSeat.side
  );
  if (idx >= 0) allSeats[idx] = newSeat;
  else allSeats.push(newSeat);
  renderAll();
  checkBirthdays();
  try {
    await pushAllSeats(buildPayload());
  } catch (err) {
    allSeats = prevAll;
    renderAll();
    checkBirthdays();
    showToast('Не удалось сохранить: ' + err.message);
    throw err;
  }
}
async function deleteSeatOptimistic(seatData) {
  const prevAll = allSeats.map(s => ({ ...s }));
  allSeats = allSeats.filter(s => !(
    s.period === seatData.period && s.row === seatData.row && s.desk === seatData.desk && s.side === seatData.side
  ));
  renderAll();
  checkBirthdays();
  try {
    await pushAllSeats(buildPayload());
  } catch (err) {
    allSeats = prevAll;
    renderAll();
    checkBirthdays();
    showToast('Не удалось удалить: ' + err.message);
    throw err;
  }
}

// ====== РЕНДЕР ======
function renderAll() {
  renderGrid();
  updateCounter();
  applySearchHighlight();
}
function renderGrid() {
  grid.innerHTML = '';
  const seats = currentSeats();
  for (let row = 1; row <= 3; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';
    for (let desk = 1; desk <= 5; desk++) {
      const pairDiv = document.createElement('div');
      pairDiv.className = 'desk-pair';
      ['left', 'right'].forEach(side => pairDiv.appendChild(makeSeat(row, desk, side, seats)));
      rowDiv.appendChild(pairDiv);
    }
    grid.appendChild(rowDiv);
  }
  fitClassroom();
  requestAnimationFrame(fitAllNames);
}

function isBirthdayToday(seat) {
  if (!seat || !seat.birthday) return false;
  const today = new Date();
  const parts = seat.birthday.split('.');
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return d === today.getDate() && m === (today.getMonth() + 1);
}

function makeSeat(row, desk, side, seats) {
  const seatData = seats.find(s => s.row === row && s.desk === desk && s.side === side);
  const div = document.createElement('div');
  div.className = 'seat' + (seatData ? ' taken' : '');
  if (seatData && isBirthdayToday(seatData)) div.classList.add('birthday');
  div.dataset.row = row;
  div.dataset.desk = desk;
  div.dataset.side = side;
  if (seatData) {
    const nameEl = document.createElement('div');
    nameEl.className = 'seat-name';
    const words = (seatData.name || '').trim().split(/\s+/).filter(w => w);
    words.forEach(w => {
      const line = document.createElement('div');
      line.textContent = w;
      nameEl.appendChild(line);
    });
    div.appendChild(nameEl);
    if (!isMobile()) {
      div.addEventListener('mouseenter', (e) => showTooltip(e, seatData));
      div.addEventListener('mousemove', moveTooltip);
      div.addEventListener('mouseleave', hideTooltip);
    }
  } else {
    const plus = document.createElement('div');
    plus.className = 'plus';
    plus.textContent = '+';
    div.appendChild(plus);
    const free = document.createElement('div');
    free.className = 'free';
    free.textContent = 'свободно';
    div.appendChild(free);
  }
  div.addEventListener('click', () => openSeat(row, desk, side, seatData));
  return div;
}

// ====== TOOLTIP ======
function showTooltip(e, seatData) {
  ttName.textContent = seatData.name || '';
  if (seatData.comment) { ttComment.textContent = seatData.comment; ttComment.style.display = ''; }
  else ttComment.style.display = 'none';
  if (seatData.birthday) {
    const parts = seatData.birthday.split('.');
    ttBday.textContent = '🎂 ' + parseInt(parts[0], 10) + ' ' + MONTHS_GEN[parseInt(parts[1], 10) - 1];
    ttBday.style.display = '';
  } else ttBday.style.display = 'none';
  tooltip.classList.add('show');
  moveTooltip(e);
}
function moveTooltip(e) {
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}
function hideTooltip() { tooltip.classList.remove('show'); }

// ====== АВТОПОДГОНКА ШРИФТА ======
function measureTextWidth(text, fontSize) {
  const probe = document.createElement('span');
  probe.style.cssText = [
    'position: absolute', 'visibility: hidden', 'white-space: nowrap',
    'left: -9999px', 'top: 0',
    'font-family: "PT Serif", Georgia, serif',
    'font-weight: bold',
    'font-size: ' + fontSize + 'px',
    'line-height: 1'
  ].join(';');
  probe.textContent = text;
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  document.body.removeChild(probe);
  return w;
}
function fitName(el) {
  const lines = Array.from(el.children);
  if (lines.length === 0) return;
  const words = lines.map(l => (l.textContent || '').trim()).filter(w => w);
  if (words.length === 0) return;
  const longest = words.reduce((a, b) => a.length >= b.length ? a : b, '');
  const parent = el.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const availW = parent.clientWidth - padL - padR - 2;
  const maxSize = NAME_MAX_DESKTOP;
  const minSize = NAME_MIN_DESKTOP;
  if (measureTextWidth(longest, maxSize) <= availW) { el.style.fontSize = maxSize + 'px'; return; }
  for (let size = maxSize - 1; size >= minSize; size--) {
    if (measureTextWidth(longest, size) <= availW) { el.style.fontSize = size + 'px'; return; }
  }
  el.style.fontSize = minSize + 'px';
}
function fitAllNames() { document.querySelectorAll('.seat-name').forEach(el => fitName(el)); }

// ====== МОДАЛКА ЗАНЯТЬ ======
function openSeat(row, desk, side, seatData) {
  editingSeat = { row, desk, side, existing: seatData };
  modalError.textContent = '';
  inputName.value = seatData ? (seatData.name || '') : '';
  inputComment.value = seatData ? (seatData.comment || '') : '';
  inputBdayDay.value = '';
  inputBdayMonth.value = '';
  if (seatData && seatData.birthday) {
    const parts = seatData.birthday.split('.');
    if (parts.length === 2) {
      inputBdayDay.value = String(parseInt(parts[0], 10));
      inputBdayMonth.value = String(parseInt(parts[1], 10));
    }
  }
  const sideName = side === 'left' ? 'левое' : 'правое';
  modalSub.textContent = 'Ряд ' + row + ', парта ' + desk + ', ' + sideName + ' место · ' + currentPeriod + ' класс';
  if (seatData) {
    modalTitle.textContent = 'Место занято';
    if (seatData.comment) modalSub.textContent += ' · ' + seatData.comment;
    btnSave.textContent = 'Сохранить';
    showDeleteButton(seatData);
  } else {
    modalTitle.textContent = 'Занять место';
    btnSave.textContent = 'Сесть';
    hideDeleteButton();
  }
  btnSave.disabled = false;
  overlay.classList.add('show');
  setTimeout(() => inputName.focus(), 100);
}
function showDeleteButton(seatData) {
  hideDeleteButton();
  const btn = document.createElement('button');
  btn.className = 'btn-delete';
  btn.id = 'btnDelete';
  btn.textContent = 'Освободить это место';
  btn.addEventListener('click', () => onDeleteClick(seatData));
  document.querySelector('.modal-actions').prepend(btn);
}
function hideDeleteButton() {
  const b = document.getElementById('btnDelete');
  if (b) b.remove();
}
btnCancel.addEventListener('click', () => overlay.classList.remove('show'));
overlay.addEventListener('click', e => { if (e.target === overlay) btnCancel.click(); });

btnSave.addEventListener('click', () => {
  const name = inputName.value.trim();
  if (!name) { modalError.textContent = 'Пожалуйста, введите имя'; return; }
  let birthday = null;
  const d = inputBdayDay.value;
  const m = inputBdayMonth.value;
  if (d && m) birthday = String(d).padStart(2, '0') + '.' + String(m).padStart(2, '0');
  const newSeat = {
    period: currentPeriod,
    row: editingSeat.row,
    desk: editingSeat.desk,
    side: editingSeat.side,
    name: name,
    comment: inputComment.value.trim() || null,
    birthday: birthday
  };
  overlay.classList.remove('show');
  saveSeatOptimistic(newSeat).catch(() => {});
});
function onDeleteClick(seatData) {
  if (!confirm('Освободить это место? Имя и комментарий будут удалены.')) return;
  overlay.classList.remove('show');
  deleteSeatOptimistic(seatData).catch(() => {});
}

// ====== МОДАЛКА СПИСОК ======
listBtn.addEventListener('click', openList);
listClose.addEventListener('click', () => listOverlay.classList.remove('show'));
listOverlay.addEventListener('click', e => { if (e.target === listOverlay) listOverlay.classList.remove('show'); });

function openList() {
  const seats = currentSeats();
  listTitle.textContent = currentPeriod + ' класс — кто сел';
  listSub.textContent = 'Всего мест занято: ' + seats.length + ' из ' + TOTAL_SEATS_PER_PERIOD;
  if (seats.length === 0) {
    listContent.innerHTML = '<div class="list-empty">Пока никто не сел. Будьте первым!</div>';
    listOverlay.classList.add('show');
    return;
  }
  const sorted = seats.slice().sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.desk !== b.desk) return a.desk - b.desk;
    return a.side === 'left' ? -1 : 1;
  });
  listContent.innerHTML = '';
  sorted.forEach(s => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const nameEl = document.createElement('div');
    nameEl.className = 'li-name';
    nameEl.textContent = s.name || '';
    item.appendChild(nameEl);
    const sideName = s.side === 'left' ? 'левое' : 'правое';
    const placeEl = document.createElement('div');
    placeEl.className = 'li-place';
    placeEl.textContent = 'Ряд ' + s.row + ', парта ' + s.desk + ', ' + sideName + ' место';
    item.appendChild(placeEl);
    if (s.comment) {
      const cEl = document.createElement('div');
      cEl.className = 'li-comment';
      cEl.textContent = '«' + s.comment + '»';
      item.appendChild(cEl);
    }
    if (s.birthday) {
      const parts = s.birthday.split('.');
      const bEl = document.createElement('div');
      bEl.className = 'li-bday';
      bEl.textContent = '🎂 ' + parseInt(parts[0], 10) + ' ' + MONTHS_GEN[parseInt(parts[1], 10) - 1];
      item.appendChild(bEl);
    }
    item.addEventListener('click', () => {
      listOverlay.classList.remove('show');
      searchInput.value = s.name || '';
      searchQuery = (s.name || '').toLowerCase();
      applySearchHighlight();
      const el = document.querySelector('.classroom-outer');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    listContent.appendChild(item);
  });
  listOverlay.classList.add('show');
}

// ====== ДЕНЬ РОЖДЕНИЯ ======
function getSeatRect(row, desk, side) {
  const seatEl = grid.querySelector('.seat[data-row="' + row + '"][data-desk="' + desk + '"][data-side="' + side + '"]');
  if (!seatEl) return null;
  const wrapRect = classroomWrap.getBoundingClientRect();
  const r = seatEl.getBoundingClientRect();
  return {
    left: r.left - wrapRect.left,
    top: r.top - wrapRect.top,
    width: r.width,
    height: r.height
  };
}
function clearBirthdayLayer() {
  birthdayLayer.innerHTML = '';
  birthdayBanner.classList.remove('show');
  birthdayBanner.textContent = '';
}

function checkBirthdays() {
  clearBirthdayLayer();
  const seats = currentSeats();
  const bdaySeats = seats.filter(isBirthdayToday);
  if (bdaySeats.length === 0) return;

  if (bdaySeats.length === 1) {
    birthdayBanner.textContent = '🎂 Сегодня день рождения у ' + bdaySeats[0].name + '! 🎉';
  } else {
    const names = bdaySeats.map(s => s.name).join(', ');
    birthdayBanner.textContent = '🎂 Сегодня день рождения: ' + names + '! 🎉';
  }
  birthdayBanner.classList.add('show');

  renderBirthdayForCurrentRow();
}

function renderBirthdayForCurrentRow() {
  birthdayLayer.innerHTML = '';
  const seats = currentSeats();
  const bdaySeats = seats.filter(isBirthdayToday);
  if (bdaySeats.length === 0) return;

  requestAnimationFrame(() => {
    bdaySeats.forEach(seat => {
      const rect = getSeatRect(seat.row, seat.desk, seat.side);
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const topY = rect.top;

      // Горшок
      const potEl = document.createElement('div');
      potEl.className = 'flower-station birthday-pot';
      potEl.style.left = (cx - 20) + 'px';
      potEl.style.top = (topY + rect.height - 40) + 'px';
      potEl.style.bottom = 'auto';
      potEl.innerHTML =
        '<div class="stem"></div>' +
        '<div class="leaf l1"></div>' +
        '<div class="leaf l2"></div>' +
        '<div class="chamomile">' +
          '<div class="petal"></div><div class="petal"></div><div class="petal"></div><div class="petal"></div>' +
          '<div class="petal"></div><div class="petal"></div><div class="petal"></div><div class="petal"></div>' +
          '<div class="center"></div>' +
        '</div>' +
        '<div class="pot"></div>';
      birthdayLayer.appendChild(potEl);

      // Плашка
      const label = document.createElement('div');
      label.className = 'birthday-label';
      label.style.left = cx + 'px';
      label.style.top = (topY - 8) + 'px';
      label.textContent = 'С днём рождения, ' + seat.name + '!';
      birthdayLayer.appendChild(label);

      // Фейерверк
      const fw = document.createElement('div');
      fw.className = 'fireworks';
      fw.style.left = cx + 'px';
      fw.style.top = topY + 'px';
      const sparkColors = ['#ffd700', '#ff8800', '#ff5577', '#aaddff', '#fff5b8'];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
        const dist = 40 + Math.random() * 50;
        const s = document.createElement('div');
        s.className = 'spark';
        s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        s.style.setProperty('--dy', (Math.sin(angle) * dist - 20) + 'px');
        s.style.background = sparkColors[i % sparkColors.length];
        s.style.boxShadow = '0 0 6px ' + sparkColors[i % sparkColors.length];
        s.style.animationDelay = (Math.random() * 0.6) + 's';
        s.style.animationDuration = (1.6 + Math.random() * 0.6) + 's';
        fw.appendChild(s);
      }
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 + Math.random() * 0.4;
        const dist = 50 + Math.random() * 40;
        const st = document.createElement('div');
        st.className = 'star';
        st.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        st.style.setProperty('--dy', (Math.sin(angle) * dist - 30) + 'px');
        st.style.animationDelay = (Math.random() * 1.2) + 's';
        st.style.animationDuration = (2.0 + Math.random() * 0.8) + 's';
        fw.appendChild(st);
      }
      birthdayLayer.appendChild(fw);
    });
  });
}

// ====== ПРИВЕТСТВЕННЫЙ ОВЕРЛЕЙ ======
const welcomeOverlay = document.getElementById('welcomeOverlay');
const welcomeEnterBtn = document.getElementById('welcomeEnterBtn');
const aboutBtn = document.getElementById('aboutBtn');
const WELCOME_KEY = 'chardjouWelcomeShown_v1';

function showWelcome() { welcomeOverlay.classList.add('show'); }
function hideWelcome() { welcomeOverlay.classList.remove('show'); }
function markWelcomeShown() {
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) {}
}
function wasWelcomeShown() {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch (e) { return false; }
}

if (!wasWelcomeShown()) {
  setTimeout(showWelcome, 400);
}

welcomeEnterBtn.addEventListener('click', () => {
  hideWelcome();
  markWelcomeShown();
});

aboutBtn.addEventListener('click', () => {
  showWelcome();
});

welcomeOverlay.addEventListener('click', (e) => {
  if (e.target === welcomeOverlay) {
    hideWelcome();
    markWelcomeShown();
  }
});

// ====== СТАРТ ======
fillBdaySelects();
setBoardDate();
initialLoad();

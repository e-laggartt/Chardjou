const API_URL = 'https://script.google.com/macros/s/AKfycbzfzJa5q2a5Bab1x9LVC3iIosg6RyeKIVADQAvKn1XXTZ4OIVFkiBBOkg5hMdL0hRQf/exec';

const TOTAL_SEATS_PER_PERIOD = 30;

const MONTHS_NOM = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DAYS_WEEK = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

// ====== ПРАЗДНИКИ ======
const HOLIDAYS = [
  { day: 1, month: 8, boardText: 'С Днём знаний!', bannerText: '📚 С Днём знаний — начало учебного года!', bouquet: true },
  { day: 5, month: 9, boardText: 'С днём учителя!', bannerText: '🌷 Сегодня День учителя — спасибо нашим учителям!', bouquet: true },
  { day: 25, month: 0, boardText: 'С Татьяниным днём!', bannerText: '🎓 День студенчества — вспомним студенческие годы!', bouquet: true },
  { day: 19, month: 4, boardText: 'С Днём пионерии!', bannerText: '🔥 День пионерии — вспомним красные галстуки!', bouquet: true }
];

// ====== ГЕОМЕТРИЯ ======
const SVG_NS = 'http://www.w3.org/2000/svg';

const DESK_W = 110;
const DESK_H = 55;
const DESK_GAP = 22;              // запас: спинка стула (8) + зазор от неё до парты ниже
const ROWS_X = [138, 406, 674];
const START_Y = 280;
const ROW_STEP = DESK_H + DESK_GAP; // 77

let currentPeriod = '5';
let allSeats = [];
let editingSeat = null;

const seatsLayer = document.getElementById('seatsLayer');
const birthdayLayer = document.getElementById('birthdayLayer');
const boardDate = document.getElementById('boardDate');
const birthdayBanner = document.getElementById('birthdayBanner');
const seatsCounter = document.getElementById('seatsCounter');
const toast = document.getElementById('toast');

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

// ====== ПРАЗДНИК ======
function getTodayHoliday() {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth();
  return HOLIDAYS.find(h => h.day === day && h.month === month) || null;
}

// ====== ДАТА НА ДОСКЕ ======
function formatDate(d) {
  return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ', ' + DAYS_WEEK[d.getDay()];
}
function setBoardDate() {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth();
  const holiday = getTodayHoliday();
  let text;
  if (holiday) {
    text = holiday.boardText;
  } else if (day === 3 && month === 8) {
    text = '3 сентября, среда';
  } else {
    text = formatDate(today);
  }
  boardDate.textContent = text;
  if (text.length > 18) boardDate.setAttribute('font-size', '26');
  else if (text.length > 12) boardDate.setAttribute('font-size', '30');
  else boardDate.setAttribute('font-size', '36');
}

// ====== ВЫПАДАШКИ ======
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

// ====== ПЕРИОДЫ ======
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    renderAll();
    checkBirthdays();
  });
});

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
    await pushAllSeats(allSeats);
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
    await pushAllSeats(allSeats);
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
  renderSeats();
  updateCounter();
}

function renderSeats() {
  seatsLayer.innerHTML = '';
  const seats = currentSeats();

  for (let row = 1; row <= 3; row++) {
    const xBase = ROWS_X[row - 1];
    for (let desk = 1; desk <= 5; desk++) {
      const yBase = START_Y + (desk - 1) * ROW_STEP;

      // Двойная парта — рамка
      const pairBg = document.createElementNS(SVG_NS, 'rect');
      pairBg.setAttribute('x', xBase - 4);
      pairBg.setAttribute('y', yBase - 4);
      pairBg.setAttribute('width', DESK_W * 2 + 8);
      pairBg.setAttribute('height', DESK_H + 8);
      pairBg.setAttribute('rx', 4);
      pairBg.setAttribute('fill', '#8b6238');
      pairBg.setAttribute('stroke', '#5e3f1e');
      pairBg.setAttribute('stroke-width', '2');
      pairBg.setAttribute('filter', 'drop-shadow(0 3px 4px rgba(0,0,0,0.3))');
      seatsLayer.appendChild(pairBg);

      // Столешница — один прямоугольник
      const top = document.createElementNS(SVG_NS, 'rect');
      top.setAttribute('x', xBase);
      top.setAttribute('y', yBase);
      top.setAttribute('width', DESK_W * 2);
      top.setAttribute('height', DESK_H);
      top.setAttribute('rx', 3);
      top.setAttribute('fill', 'url(#deskWoodGrad)');
      top.setAttribute('stroke', '#8b7548');
      top.setAttribute('stroke-width', '1');
      seatsLayer.appendChild(top);

      // Блик сверху
      const shine = document.createElementNS(SVG_NS, 'rect');
      shine.setAttribute('x', xBase + 4);
      shine.setAttribute('y', yBase + 2);
      shine.setAttribute('width', DESK_W * 2 - 8);
      shine.setAttribute('height', 6);
      shine.setAttribute('rx', 2);
      shine.setAttribute('fill', 'rgba(255,255,255,0.3)');
      shine.setAttribute('pointer-events', 'none');
      seatsLayer.appendChild(shine);

      // Разделитель посередине парты
      const divider = document.createElementNS(SVG_NS, 'line');
      divider.setAttribute('x1', xBase + DESK_W);
      divider.setAttribute('y1', yBase + 4);
      divider.setAttribute('x2', xBase + DESK_W);
      divider.setAttribute('y2', yBase + DESK_H - 4);
      divider.setAttribute('stroke', '#8b7548');
      divider.setAttribute('stroke-width', '1');
      divider.setAttribute('opacity', '0.55');
      divider.setAttribute('pointer-events', 'none');
      seatsLayer.appendChild(divider);

      // Две спинки стульев — под каждой половиной парты
      const chairW = DESK_W * 0.55;
      const chairH = 8;
      const chairY = yBase + DESK_H + 2;
      ['left', 'right'].forEach((side, idx) => {
        const halfX = xBase + idx * DESK_W;
        const chairX = halfX + DESK_W / 2 - chairW / 2;
        const chair = document.createElementNS(SVG_NS, 'rect');
        chair.setAttribute('x', chairX);
        chair.setAttribute('y', chairY);
        chair.setAttribute('width', chairW);
        chair.setAttribute('height', chairH);
        chair.setAttribute('rx', 3);
        chair.setAttribute('fill', 'url(#frameWoodGrad)');
        chair.setAttribute('stroke', '#5e3f1e');
        chair.setAttribute('stroke-width', '1.5');
        chair.setAttribute('pointer-events', 'none');
        seatsLayer.appendChild(chair);
      });

      // Левая и правая половины (для клика и подсветки)
      ['left', 'right'].forEach((side, idx) => {
        const seatX = xBase + idx * DESK_W;
        const seatG = makeSeat(row, desk, side, seatX, yBase, seats);
        seatsLayer.appendChild(seatG);
      });
    }
  }
}

function makeSeat(row, desk, side, x, y, seats) {
  const seatData = seats.find(s => s.row === row && s.desk === desk && s.side === side);
  const isBday = seatData && isBirthdayToday(seatData);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'seat-group' + (isBday ? ' seat-birthday' : ''));
  g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
  g.style.cursor = 'pointer';

  if (isBday) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', DESK_W);
    bg.setAttribute('height', DESK_H);
    bg.setAttribute('rx', 3);
    bg.setAttribute('fill', 'url(#deskWoodBirthdayGrad)');
    bg.setAttribute('stroke', '#b89840');
    bg.setAttribute('stroke-width', '1.5');
    bg.setAttribute('pointer-events', 'none');
    g.appendChild(bg);
  } else if (seatData) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', DESK_W);
    bg.setAttribute('height', DESK_H);
    bg.setAttribute('rx', 3);
    bg.setAttribute('fill', 'url(#deskWoodTakenGrad)');
    bg.setAttribute('stroke', '#5e7a4a');
    bg.setAttribute('stroke-width', '0.8');
    bg.setAttribute('pointer-events', 'none');
    g.appendChild(bg);
  }

  if (seatData) {
    const words = (seatData.name || '').trim().split(/\s+/).filter(w => w);
    const lines = words.slice(0, 3);
    const fontSize = pickFontSize(lines, DESK_W - 12);
    const lineHeight = fontSize * 1.05;
    const totalHeight = lines.length * lineHeight;
    const startY = DESK_H / 2 - totalHeight / 2 + lineHeight * 0.85;

    lines.forEach((word, i) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'seat-name');
      t.setAttribute('x', DESK_W / 2);
      t.setAttribute('y', startY + i * lineHeight);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'PT Serif, Georgia, serif');
      t.setAttribute('font-size', fontSize);
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('fill', '#3d2f1e');
      t.textContent = word;
      g.appendChild(t);
    });
  } else {
    const plus = document.createElementNS(SVG_NS, 'text');
    plus.setAttribute('class', 'plus-sign');
    plus.setAttribute('x', DESK_W / 2);
    plus.setAttribute('y', DESK_H / 2 + 2);
    plus.setAttribute('text-anchor', 'middle');
    plus.setAttribute('font-family', 'Georgia, serif');
    plus.setAttribute('font-size', 22);
    plus.setAttribute('fill', '#b89868');
    plus.textContent = '+';
    g.appendChild(plus);

    const free = document.createElementNS(SVG_NS, 'text');
    free.setAttribute('class', 'plus-sign');
    free.setAttribute('x', DESK_W / 2);
    free.setAttribute('y', DESK_H / 2 + 16);
    free.setAttribute('text-anchor', 'middle');
    free.setAttribute('font-family', 'Georgia, serif');
    free.setAttribute('font-size', 10);
    free.setAttribute('font-style', 'italic');
    free.setAttribute('fill', '#a89468');
    free.textContent = 'свободно';
    g.appendChild(free);
  }

  const clickZone = document.createElementNS(SVG_NS, 'rect');
  clickZone.setAttribute('width', DESK_W);
  clickZone.setAttribute('height', DESK_H);
  clickZone.setAttribute('fill', 'transparent');
  clickZone.style.cursor = 'pointer';
  g.appendChild(clickZone);

  g.addEventListener('click', () => openSeat(row, desk, side, seatData));

  if (seatData) {
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = seatData.name + (seatData.comment ? ' — ' + seatData.comment : '');
    g.appendChild(title);
  }
  return g;
}

function pickFontSize(words, maxWidth) {
  const longest = words.reduce((a, b) => a.length >= b.length ? a : b, '');
  const size = Math.floor(maxWidth / (longest.length * 0.55));
  return Math.max(9, Math.min(15, size));
}

function isBirthdayToday(seat) {
  if (!seat || !seat.birthday) return false;
  const today = new Date();
  const parts = seat.birthday.split('.');
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return d === today.getDate() && m === (today.getMonth() + 1);
}

// ====== МОДАЛКА ======
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

// ====== ПРАЗДНИКИ И ДНИ РОЖДЕНИЯ ======
function checkBirthdays() {
  birthdayLayer.innerHTML = '';
  birthdayBanner.classList.remove('show');
  birthdayBanner.textContent = '';

  const holiday = getTodayHoliday();
  if (holiday) {
    birthdayBanner.textContent = holiday.bannerText;
    birthdayBanner.classList.add('show');
    if (holiday.bouquet) renderTeacherBouquet();
  }

  const seats = currentSeats();
  const bdaySeats = seats.filter(isBirthdayToday);
  if (bdaySeats.length > 0) {
    let bdayText;
    if (bdaySeats.length === 1) {
      bdayText = '🎂 Сегодня день рождения у ' + bdaySeats[0].name + '!';
    } else {
      const names = bdaySeats.map(s => s.name).join(', ');
      bdayText = '🎂 Сегодня день рождения: ' + names + '!';
    }
    if (birthdayBanner.textContent) {
      birthdayBanner.textContent += ' · ' + bdayText;
    } else {
      birthdayBanner.textContent = bdayText;
    }
    birthdayBanner.classList.add('show');
    renderBirthdays(bdaySeats);
    if (holiday && holiday.bouquet) renderTeacherBouquet();
  }
}

function getSeatCenter(row, desk, side) {
  const xBase = ROWS_X[row - 1];
  const yBase = START_Y + (desk - 1) * ROW_STEP;
  const x = xBase + (side === 'right' ? DESK_W : 0) + DESK_W / 2;
  return { x: x, y: yBase + DESK_H / 2, topY: yBase, width: DESK_W, height: DESK_H };
}

function renderBirthdays(bdaySeats) {
  bdaySeats.forEach(seat => {
    const c = getSeatCenter(seat.row, seat.desk, seat.side);

    drawFlower(birthdayLayer, c.x, c.topY + c.height - 4, 0.9);

    const labelG = document.createElementNS(SVG_NS, 'g');
    const textStr = 'С днём рождения, ' + seat.name + '!';
    const fontSize = 13;
    const estWidth = textStr.length * fontSize * 0.5;
    const labelW = estWidth + 20;
    const labelH = 24;
    const labelX = c.x - labelW / 2;
    const labelY = c.topY - labelH - 12;

    const labelRect = document.createElementNS(SVG_NS, 'rect');
    labelRect.setAttribute('x', labelX);
    labelRect.setAttribute('y', labelY);
    labelRect.setAttribute('width', labelW);
    labelRect.setAttribute('height', labelH);
    labelRect.setAttribute('rx', 6);
    labelRect.setAttribute('fill', 'url(#deskWoodBirthdayGrad)');
    labelRect.setAttribute('stroke', '#b89840');
    labelRect.setAttribute('stroke-width', '1.5');
    labelRect.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(232,200,64,0.5))');
    labelG.appendChild(labelRect);

    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.setAttribute('x', c.x);
    labelText.setAttribute('y', labelY + 17);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('font-family', 'Caveat, cursive');
    labelText.setAttribute('font-size', fontSize);
    labelText.setAttribute('font-weight', '700');
    labelText.setAttribute('fill', '#4a3520');
    labelText.textContent = textStr;
    labelG.appendChild(labelText);
    birthdayLayer.appendChild(labelG);

    drawFireworks(birthdayLayer, c.x, c.topY - 25);
  });
}

function renderTeacherBouquet() {
  const cx = 520;
  const topY = 180;

  const colors = ['#e85a7a', '#f4a02c', '#e8c040', '#c858a0', '#e85a7a'];
  const offsets = [-28, -14, 0, 14, 28];
  colors.forEach((col, i) => {
    drawFlower(birthdayLayer, cx + offsets[i], topY - 20 - Math.abs(offsets[i]) * 0.2, 0.9, col);
  });

  drawFireworks(birthdayLayer, cx, topY - 30);
}

function drawFlower(parent, cx, topY, scale, petalColor) {
  petalColor = petalColor || '#f8f4e8';
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', 'translate(' + cx + ',' + topY + ') scale(' + scale + ')');

  const stem = document.createElementNS(SVG_NS, 'line');
  stem.setAttribute('x1', 0); stem.setAttribute('y1', 0);
  stem.setAttribute('x2', 0); stem.setAttribute('y2', -14);
  stem.setAttribute('stroke', '#4a6b3a');
  stem.setAttribute('stroke-width', '2');
  g.appendChild(stem);

  const leaf1 = document.createElementNS(SVG_NS, 'ellipse');
  leaf1.setAttribute('cx', -6); leaf1.setAttribute('cy', -6);
  leaf1.setAttribute('rx', 5); leaf1.setAttribute('ry', 2.5);
  leaf1.setAttribute('fill', '#5e8a4a');
  leaf1.setAttribute('transform', 'rotate(-25 -6 -6)');
  g.appendChild(leaf1);

  const leaf2 = document.createElementNS(SVG_NS, 'ellipse');
  leaf2.setAttribute('cx', 6); leaf2.setAttribute('cy', -8);
  leaf2.setAttribute('rx', 5); leaf2.setAttribute('ry', 2.5);
  leaf2.setAttribute('fill', '#5e8a4a');
  leaf2.setAttribute('transform', 'rotate(25 6 -8)');
  g.appendChild(leaf2);

  const pot = document.createElementNS(SVG_NS, 'rect');
  pot.setAttribute('x', -10); pot.setAttribute('y', -2);
  pot.setAttribute('width', 20); pot.setAttribute('height', 14);
  pot.setAttribute('rx', 2);
  pot.setAttribute('fill', '#a04028');
  pot.setAttribute('stroke', '#5e2510');
  pot.setAttribute('stroke-width', '1');
  g.appendChild(pot);

  const potTop = document.createElementNS(SVG_NS, 'rect');
  potTop.setAttribute('x', -11); potTop.setAttribute('y', -4);
  potTop.setAttribute('width', 22); potTop.setAttribute('height', 4);
  potTop.setAttribute('rx', 1);
  potTop.setAttribute('fill', '#8a3a20');
  g.appendChild(potTop);

  for (let i = 0; i < 8; i++) {
    const angle = (360 / 8) * i;
    const petal = document.createElementNS(SVG_NS, 'ellipse');
    petal.setAttribute('cx', 0); petal.setAttribute('cy', -21);
    petal.setAttribute('rx', 3); petal.setAttribute('ry', 6);
    petal.setAttribute('fill', petalColor);
    petal.setAttribute('transform', 'rotate(' + angle + ' 0 -14)');
    g.appendChild(petal);
  }

  const center = document.createElementNS(SVG_NS, 'circle');
  center.setAttribute('cx', 0); center.setAttribute('cy', -14);
  center.setAttribute('r', 4);
  center.setAttribute('fill', '#e8c040');
  center.setAttribute('stroke', '#b89840');
  center.setAttribute('stroke-width', '0.5');
  g.appendChild(center);

  parent.appendChild(g);
}

function drawFireworks(parent, cx, cy) {
  const sparkColors = ['#ffd700', '#ff8800', '#ff5577', '#aaddff', '#fff5b8'];

  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
    const dist = 40 + Math.random() * 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 20;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'spark');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', 2.5);
    circle.setAttribute('fill', sparkColors[i % sparkColors.length]);
    circle.style.setProperty('--dx', dx + 'px');
    circle.style.setProperty('--dy', dy + 'px');
    circle.style.animationDelay = (Math.random() * 0.6) + 's';
    circle.style.animationDuration = (1.6 + Math.random() * 0.6) + 's';
    circle.style.transformOrigin = cx + 'px ' + cy + 'px';
    parent.appendChild(circle);
  }

  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 + Math.random() * 0.4;
    const dist = 50 + Math.random() * 40;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30;
    const star = document.createElementNS(SVG_NS, 'polygon');
    star.setAttribute('class', 'star');
    star.setAttribute('points', cx + ',' + (cy - 4) + ' ' + (cx + 2) + ',' + (cy + 2) + ' ' + (cx - 2) + ',' + (cy + 2));
    star.setAttribute('fill', '#fff5b8');
    star.setAttribute('stroke', '#ffd700');
    star.setAttribute('stroke-width', '0.5');
    star.style.setProperty('--dx', dx + 'px');
    star.style.setProperty('--dy', dy + 'px');
    star.style.animationDelay = (Math.random() * 1.2) + 's';
    star.style.animationDuration = (2.0 + Math.random() * 0.8) + 's';
    star.style.transformOrigin = cx + 'px ' + cy + 'px';
    parent.appendChild(star);
  }
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

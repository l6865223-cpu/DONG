/* DONG 包裝規格查詢
 * 所有資料只在瀏覽器內處理：沒有任何 fetch / 上傳。載入的 Excel 只會存在這台電腦的 localStorage（可關閉）。
 */
(() => {
  'use strict';

  const LIMIT_KG = 20;          // 外銷限重
  const STORE_KEY = 'dong-specs-v1';
  const TABLE_PAGE = 200;
  const BAR_TOP = 8;
  const NONE = '（未填）';

  // ---------- 欄位定義（總表範本、匯入、匯出共用） ----------
  const OPTIONS = {
    surf: ['陽極', '硬陽本色', '噴砂', '電鍍', '皮膜', '無'],
    market: ['內銷', '外銷'],
    box: ['3層紙箱', '5層紙箱', '客戶指定'],
    sizeType: ['標準尺寸', '客製尺寸(割箱)', '客戶提供'],
    cushion: ['無', '泡棉', '紙板隔層', 'PE紙', '單光紙', 'PE袋'],
    tape: ['OPP膠帶', '牛皮紙膠帶', '外銷膠帶'],
    sealer: ['無', '分層用', '封口用'],
    seal: ['H型', '十字型', '打包機防護'],
    label: ['側面', '正面', '上蓋'],
    drawing: ['有', '無'],
    attach: ['客戶包裝規範', '包裝示意圖', '包裝樣品照片'],
  };
  const COLS = [
    { key: 'dwg', label: '圖號', type: 'text', required: true, aliases: ['料號', '品號'], help: '必填，每筆唯一' },
    { key: 'cust', label: '客戶', type: 'text', aliases: ['客戶名稱', '客戶代號'], help: '對外公開時請用代號，例如「客戶 A」' },
    { key: 'spec', label: '規格', type: 'text', aliases: ['品名', '品名規格'] },
    { key: 'mat', label: '材質', type: 'text', aliases: ['材料'] },
    { key: 'surf', label: '表面處理', type: 'multi' },
    { key: 'market', label: '出貨別', type: 'single', aliases: ['內外銷', '內/外銷'], help: '外銷才會檢查 20KG 限重' },
    { key: 'box', label: '包材種類', type: 'single', aliases: ['包材'] },
    { key: 'L', label: '長(cm)', type: 'num', aliases: ['長'] },
    { key: 'W', label: '寬(cm)', type: 'num', aliases: ['寬'] },
    { key: 'H', label: '高(cm)', type: 'num', aliases: ['高'] },
    { key: 'sizeType', label: '尺寸類型', type: 'single' },
    { key: 'cushion', label: '緩衝包材', type: 'multi' },
    { key: 'tape', label: '膠帶材質', type: 'multi', aliases: ['膠帶'] },
    { key: 'sealer', label: '封口機', type: 'single' },
    { key: 'seal', label: '封箱方式', type: 'multi', aliases: ['黏法', '封箱方式(黏法)'] },
    { key: 'label', label: '貼箱位置', type: 'multi' },
    { key: 'drawing', label: '包裝圖', type: 'single', aliases: ['包裝圖/圖面', '圖面'] },
    { key: 'unitW', label: '單支重量(kg)', type: 'num', aliases: ['單支重量', '單支重'] },
    { key: 'qty', label: '一箱數量', type: 'num', aliases: ['每箱數量', '入數'] },
    { key: 'packW', label: '包材重量(kg)', type: 'num', aliases: ['包材重量', '包材重'] },
    { key: 'total', label: '總重(kg)', type: 'num', aliases: ['總重', '毛重', '總重量'] },
    { key: 'notes', label: '特別要求', type: 'list', aliases: ['備註', '特別要求/備註'], help: '多條請用換行或「；」分隔' },
    { key: 'attach', label: '附件', type: 'multi', aliases: ['附件檢附'] },
    { key: 'approved', label: '核定日期', type: 'date' },
    { key: 'revised', label: '修改日期', type: 'date' },
    { key: 'ver', label: '版本', type: 'text', aliases: ['版次', '版號'] },
  ];
  const COL = Object.fromEntries(COLS.map(c => [c.key, c]));
  const ARRAY_KEYS = COLS.filter(c => c.type === 'multi' || c.type === 'list').map(c => c.key);

  const DIMS = [
    { key: 'cust', title: '客戶' },
    { key: 'mat', title: '材質' },
    { key: 'surf', title: '表面處理' },
    { key: 'market', title: '出貨別' },
    { key: 'box', title: '包材種類' },
    { key: 'seal', title: '封箱方式' },
    { key: 'cushion', title: '緩衝包材' },
    { key: 'tape', title: '膠帶材質' },
  ];
  const TITLE = Object.fromEntries(DIMS.map(d => [d.key, d.title]));
  TITLE.flags = '檢查結果';
  const FLAG_CRIT = '外銷超重';
  const FLAG_WARN = '重量對不上';

  // ---------- 小工具 ----------
  const $ = s => document.querySelector(s);
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
    return e;
  }
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, d = 2) => isNum(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : '—';
  const vals = (row, key) => {
    const v = row[key];
    const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
    return arr.length ? arr : [NONE];
  };
  const text = v => Array.isArray(v) ? v.join('、') : (v == null ? '' : String(v));
  function toast(msg) {
    const t = el('div', { class: 'toast', role: 'status', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------- 資料 ----------
  let raw = [];          // 原始列（可存檔）
  let rows = [];         // 加上計算欄位
  let source = { kind: 'demo', label: '示範資料', savedAt: null };
  let totals = {};       // 每個維度：整份資料的 value -> 筆數（決定長條順序，篩選時不跳動）
  let binW = 2, nBins = 1;

  function prep(r, i) {
    const row = { ...r, _id: i };
    for (const k of ARRAY_KEYS) if (!Array.isArray(row[k])) row[k] = row[k] == null || row[k] === '' ? [] : [row[k]];
    const calc = isNum(row.unitW) && isNum(row.qty) ? row.unitW * row.qty + (isNum(row.packW) ? row.packW : 0) : null;
    row._calc = calc;
    const flags = [];
    if (isNum(row.total) && row.total > LIMIT_KG && row.market !== '內銷') flags.push(FLAG_CRIT);
    if (calc != null && isNum(row.total) && Math.abs(calc - row.total) > Math.max(0.3, row.total * 0.05)) flags.push(FLAG_WARN);
    row.flags = flags.length ? flags : ['正常'];
    row._search = [row.dwg, row.cust, row.spec, row.mat, ...row.notes].join(' ').toLowerCase();
    return row;
  }

  function setData(list, src) {
    raw = list;
    rows = list.map(prep);
    source = src;
    totals = {};
    for (const d of [...DIMS, { key: 'flags' }]) {
      const m = new Map();
      for (const r of rows) for (const v of vals(r, d.key)) m.set(v, (m.get(v) || 0) + 1);
      totals[d.key] = [...m.entries()].sort((a, b) => (a[0] === NONE) - (b[0] === NONE) || b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
    }
    const max = Math.max(0, ...rows.map(r => isNum(r.total) ? r.total : 0));
    binW = max <= 30 ? 2 : max <= 60 ? 5 : 10;
    nBins = Math.max(Math.ceil(Math.max(max, LIMIT_KG + binW) / binW), 1);
    // 篩選值若在新資料裡不存在就丟掉
    for (const k of Object.keys(state.sel)) {
      const known = new Set((totals[k] || []).map(e => e[0]));
      state.sel[k] = new Set([...state.sel[k]].filter(v => known.has(v)));
    }
    state.bins = new Set([...state.bins].filter(b => b < nBins));
    showLimit = TABLE_PAGE;
  }
  const binOf = r => isNum(r.total) ? Math.min(Math.floor(r.total / binW), nBins - 1) : null;
  const binLabel = b => `${b * binW}–${(b + 1) * binW} kg`;

  // ---------- 篩選狀態 ----------
  const state = { q: '', sel: {}, bins: new Set(), sort: { key: 'dwg', dir: 1 } };
  const undoStack = [];
  let showLimit = TABLE_PAGE;
  const snapshot = () => JSON.stringify({ q: state.q, sel: Object.fromEntries(Object.entries(state.sel).map(([k, s]) => [k, [...s]])), bins: [...state.bins] });
  function restore(snap) {
    const s = JSON.parse(snap);
    state.q = s.q; state.sel = Object.fromEntries(Object.entries(s.sel).map(([k, a]) => [k, new Set(a)])); state.bins = new Set(s.bins);
    $('#q').value = state.q;
  }
  function change(fn) {
    const before = snapshot();
    fn();
    if (snapshot() === before) return;
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    showLimit = TABLE_PAGE;
    render();
  }
  const toggle = (key, v) => change(() => {
    const s = state.sel[key] || (state.sel[key] = new Set());
    s.has(v) ? s.delete(v) : s.add(v);
  });
  const hasSel = key => key === 'bins' ? state.bins.size > 0 : !!(state.sel[key] && state.sel[key].size);
  const qTokens = () => state.q.toLowerCase().split(/\s+/).filter(Boolean);

  function pass(r, except, tokens) {
    for (const t of tokens) if (!r._search.includes(t)) return false;
    for (const [k, s] of Object.entries(state.sel)) {
      if (k === except || !s.size) continue;
      if (!vals(r, k).some(v => s.has(v))) return false;
    }
    if (except !== 'bins' && state.bins.size) {
      const b = binOf(r);
      if (b == null || !state.bins.has(b)) return false;
    }
    return true;
  }

  // 網址記住篩選（可分享、重新整理不會掉）
  function writeHash() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    for (const [k, s] of Object.entries(state.sel)) if (s.size) p.set(k, [...s].join('|'));
    if (state.bins.size) p.set('bins', [...state.bins].sort((a, b) => a - b).join('|'));
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.q = p.get('q') || '';
    state.sel = {};
    for (const k of [...DIMS.map(d => d.key), 'flags']) if (p.get(k)) state.sel[k] = new Set(p.get(k).split('|'));
    state.bins = new Set((p.get('bins') || '').split('|').filter(Boolean).map(Number).filter(Number.isInteger));
    $('#q').value = state.q;
  }

  // ---------- 提示框 ----------
  const tip = $('#tip');
  function showTip(target, ev, strong, lines) {
    tip.replaceChildren(el('strong', { text: strong }), ...lines.filter(Boolean).map(l => el('div', { class: 'l', text: l })));
    tip.hidden = false;
    const r = target.getBoundingClientRect();
    const x = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2;
    const y = ev && ev.clientY != null ? ev.clientY : r.top;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, x + 14), innerWidth - w - 8) + 'px';
    tip.style.top = (y - h - 12 < 8 ? y + 18 : y - h - 12) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function hoverable(node, fn) {
    node.addEventListener('pointermove', ev => fn(ev));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', () => fn(null));
    node.addEventListener('blur', hideTip);
  }

  // ---------- 畫面 ----------
  function render() {
    const tokens = qTokens();
    const filtered = rows.filter(r => pass(r, null, tokens));
    renderSource();
    renderChips();
    renderKpis(filtered, tokens);
    renderCharts(tokens);
    renderTable(filtered, tokens);
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-clear').disabled = !(state.q || state.bins.size || Object.values(state.sel).some(s => s.size));
    writeHash();
    if (drawerRow != null) refreshDrawerNav();
  }

  function renderSource() {
    const box = $('#source');
    if (source.kind === 'demo') {
      box.className = 'source demo';
      box.replaceChildren(
        el('span', { class: 'grow' }, el('b', { text: '目前是虛構的示範資料' }), '（客戶、圖號都是假的）。按「載入 Excel／CSV」換成你們的資料——',
          el('b', { text: '檔案只在這台電腦的瀏覽器裡處理，不會上傳到任何地方' }), '。'),
      );
    } else {
      box.className = 'source mine';
      const when = source.savedAt ? new Date(source.savedAt).toLocaleString('zh-TW', { hour12: false }) : '';
      box.replaceChildren(
        el('span', { class: 'grow' }, el('b', { text: `你的資料：${rows.length} 筆` }), `　來源：${source.label}${when ? '　載入於 ' + when : ''}`,
          source.saved ? '　（已記在這台電腦的瀏覽器）' : '　（未記住，重新整理後會回到示範資料）'),
        el('button', { class: 'linkbtn', type: 'button', text: '清除，回到示範資料', onclick: clearMine }),
      );
    }
  }

  function renderChips() {
    const box = $('#chips');
    const chips = [];
    const chip = (label, value, onx) => el('span', { class: 'chip' }, el('b', { text: label + '：' }), el('span', { text: value }),
      el('button', { type: 'button', 'aria-label': `移除 ${label} 篩選`, text: '✕', onclick: onx }));
    if (state.q) chips.push(chip('搜尋', state.q, () => change(() => { state.q = ''; $('#q').value = ''; })));
    for (const [k, s] of Object.entries(state.sel)) if (s.size) chips.push(chip(TITLE[k] || k, [...s].join('、'), () => change(() => { state.sel[k] = new Set(); })));
    if (state.bins.size) chips.push(chip('總重', [...state.bins].sort((a, b) => a - b).map(binLabel).join('、'), () => change(() => { state.bins = new Set(); })));
    if (chips.length) chips.push(el('span', { class: 'hint', text: '不同欄位之間是「而且」，同一欄位內多選是「或」' }));
    box.replaceChildren(...chips);
  }

  function renderKpis(filtered, tokens) {
    const n = filtered.length;
    const custs = new Set(filtered.map(r => r.cust).filter(Boolean)).size;
    const qtys = filtered.map(r => r.qty).filter(isNum);
    const tws = filtered.map(r => r.total).filter(isNum);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    // 檢查結果的數字不受自己的篩選影響，才看得到「還有幾筆」
    const base = rows.filter(r => pass(r, 'flags', tokens));
    const crit = base.filter(r => r.flags.includes(FLAG_CRIT)).length;
    const warn = base.filter(r => r.flags.includes(FLAG_WARN)).length;
    const fsel = state.sel.flags || new Set();
    const tile = (label, value, unit, sub) => el('div', { class: 'kpi' },
      el('div', { class: 'k', text: label }), el('div', { class: 'v' }, value, unit ? el('small', { text: unit }) : null), sub ? el('div', { class: 'sub', text: sub }) : null);
    const flagTile = (flag, count, cls, icon, sub) => el('button', {
      class: `kpi ${count ? cls : ''} ${fsel.has(flag) ? 'on' : ''}`, type: 'button', 'aria-pressed': String(fsel.has(flag)),
      title: fsel.has(flag) ? '再點一次取消' : '點一下只看這些', onclick: () => toggle('flags', flag),
    }, el('div', { class: 'k' }, el('span', { 'aria-hidden': 'true', text: icon }), flag), el('div', { class: 'v' }, String(count), el('small', { text: '筆' })), el('div', { class: 'sub', text: sub }));
    $('#kpis').replaceChildren(
      tile('符合條件', String(n), `／${rows.length} 筆`, n === rows.length ? '目前沒有篩選' : `已篩掉 ${rows.length - n} 筆`),
      tile('客戶數', String(custs), '家'),
      tile('平均一箱數量', qtys.length ? fmt(avg(qtys), 0) : '—', '支'),
      tile('平均總重', tws.length ? fmt(avg(tws), 1) : '—', 'kg'),
      flagTile(FLAG_CRIT, crit, 'crit', '⛔', `外銷箱超過 ${LIMIT_KG}KG`),
      flagTile(FLAG_WARN, warn, 'warn', '⚠', '單支×數量＋包材 ≠ 總重'),
    );
  }

  const expanded = new Set();
  function renderCharts(tokens) {
    const cards = DIMS.map(d => {
      const cross = new Map();
      for (const r of rows) if (pass(r, d.key, tokens)) for (const v of vals(r, d.key)) cross.set(v, (cross.get(v) || 0) + 1);
      const all = totals[d.key];
      const max = Math.max(1, ...all.map(e => e[1]));
      const sel = state.sel[d.key] || new Set();
      const list = expanded.has(d.key) ? all : all.slice(0, BAR_TOP);
      const bars = list.map(([v, tot]) => {
        const c = cross.get(v) || 0;
        const on = sel.has(v);
        const b = el('button', {
          class: `bar ${on ? 'sel' : ''} ${sel.size && !on ? 'off' : ''}`, type: 'button', 'aria-pressed': String(on),
          'aria-label': `${d.title} ${v}：目前 ${c} 筆，全部 ${tot} 筆`, onclick: () => toggle(d.key, v),
        },
          el('span', { class: 'bl', text: v }),
          el('span', { class: 'bt' }, el('span', { class: 'bg', style: `width:${tot / max * 100}%` }), el('span', { class: 'bf', style: `width:${c / max * 100}%` })),
          el('span', { class: 'bn' }, String(c), c !== tot ? el('small', { text: `/${tot}` }) : null),
        );
        hoverable(b, ev => showTip(b, ev, `${c} 筆`, [`${d.title}：${v}`, `全部資料 ${tot} 筆`, on ? '再點一次取消' : '點一下篩選']));
        return b;
      });
      const more = all.length > BAR_TOP ? el('button', {
        class: 'linkbtn more', type: 'button', text: expanded.has(d.key) ? '收合' : `顯示全部 ${all.length} 項`,
        onclick: () => { expanded.has(d.key) ? expanded.delete(d.key) : expanded.add(d.key); render(); },
      }) : null;
      return el('div', { class: 'card' },
        el('div', { class: 'card-h' }, el('h3', { text: d.title }),
          sel.size ? el('button', { class: 'linkbtn clr', type: 'button', text: '清除', onclick: () => change(() => { state.sel[d.key] = new Set(); }) }) : null),
        el('div', { class: 'bars', role: 'group', 'aria-label': d.title }, bars), more);
    });
    $('#charts').replaceChildren(histCard(tokens), ...cards);
  }

  function histCard(tokens) {
    const g = new Array(nBins).fill(0), f = new Array(nBins).fill(0);
    let missing = 0;
    for (const r of rows) {
      const b = binOf(r);
      if (b == null) { missing++; continue; }
      g[b]++;
      if (pass(r, 'bins', tokens)) f[b]++;
    }
    const max = Math.max(1, ...g);
    const cols = el('div', { class: 'cols', style: `grid-template-columns:repeat(${nBins},1fr)` });
    for (let b = 0; b < nBins; b++) {
      const on = state.bins.has(b);
      const c = el('button', {
        class: `col ${on ? 'sel' : ''} ${state.bins.size && !on ? 'off' : ''}`, type: 'button', 'aria-pressed': String(on),
        'aria-label': `總重 ${binLabel(b)}：目前 ${f[b]} 筆，全部 ${g[b]} 筆`,
        onclick: () => change(() => { state.bins.has(b) ? state.bins.delete(b) : state.bins.add(b); }),
      }, el('span', { class: 'g', style: `height:${g[b] / max * 100}%` }), el('span', { class: 'f', style: `height:${f[b] / max * 100}%` }));
      hoverable(c, ev => showTip(c, ev, `${f[b]} 筆`, [`總重 ${binLabel(b)}`, `全部資料 ${g[b]} 筆`, (b + 1) * binW > LIMIT_KG ? `超過 ${LIMIT_KG}KG 的區間（外銷不可）` : '']));
      cols.append(c);
    }
    cols.append(el('div', { class: 'limit', style: `left:${LIMIT_KG / (nBins * binW) * 100}%` }, el('span', { text: `外銷限重 ${LIMIT_KG}KG` })));
    const axis = el('div', { class: 'axis', 'aria-hidden': 'true' });
    const step = nBins > 16 ? 4 : nBins > 8 ? 2 : 1;
    for (let e = 0; e < nBins; e += step) axis.append(el('span', { style: `left:${e / nBins * 100}%`, text: String(e * binW) }));
    axis.append(el('span', { class: 'unit', text: 'kg' }));
    return el('div', { class: 'card wide' },
      el('div', { class: 'card-h' }, el('h3', { text: '每箱總重分布' }),
        state.bins.size ? el('button', { class: 'linkbtn clr', type: 'button', text: '清除', onclick: () => change(() => { state.bins = new Set(); }) }) : null),
      el('div', { class: 'hist' }, cols), axis,
      el('div', { class: 'hist-note', text: `每格 ${binW} kg，可多選。${missing ? `另有 ${missing} 筆沒填總重。` : ''}` }));
  }

  // ---------- 表格 ----------
  const TCOLS = [
    { key: 'dwg', label: '圖號' },
    { key: 'cust', label: '客戶', f: true },
    { key: 'spec', label: '規格' },
    { key: 'mat', label: '材質', f: true },
    { key: 'surf', label: '表面處理', f: true },
    { key: 'market', label: '出貨別', f: true },
    { key: 'box', label: '包材', f: true },
    { key: 'size', label: '尺寸 (cm)', get: r => [r.L, r.W, r.H].every(isNum) ? `${r.L}×${r.W}×${r.H}` : '—' },
    { key: 'seal', label: '封箱', f: true },
    { key: 'qty', label: '一箱數量', r: true },
    { key: 'unitW', label: '單支 kg', r: true },
    { key: 'total', label: '總重 kg', r: true },
    { key: 'flags', label: '檢查' },
  ];

  function hl(str, tokens) {
    const s = String(str ?? '');
    if (!tokens.length || !s) return [s];
    const low = s.toLowerCase();
    const marks = new Array(s.length).fill(false);
    for (const t of tokens) { let i = low.indexOf(t); while (i >= 0) { for (let j = i; j < i + t.length; j++) marks[j] = true; i = low.indexOf(t, i + 1); } }
    const out = []; let buf = '', cur = false;
    for (let i = 0; i < s.length; i++) {
      if (marks[i] !== cur) { if (buf) out.push(cur ? el('mark', { text: buf }) : buf); buf = ''; cur = marks[i]; }
      buf += s[i];
    }
    if (buf) out.push(cur ? el('mark', { text: buf }) : buf);
    return out;
  }

  function sortRows(list) {
    const { key, dir } = state.sort;
    const get = r => key === 'flags' ? (r.flags.includes(FLAG_CRIT) ? 0 : r.flags.includes(FLAG_WARN) ? 1 : 2)
      : key === 'size' ? (isNum(r.L) ? r.L * r.W * r.H : null) : Array.isArray(r[key]) ? r[key].join('、') : r[key];
    return [...list].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-Hant', { numeric: true })) * dir;
    });
  }

  let lastSorted = [];
  function renderTable(filtered, tokens) {
    const list = sortRows(filtered);
    lastSorted = list;
    $('#tcount').textContent = `顯示 ${Math.min(list.length, showLimit)} ／ 符合 ${list.length} ／ 全部 ${rows.length} 筆`;
    const head = el('tr', null, TCOLS.map(c => el('th', { class: c.r ? 'r' : null, 'aria-sort': state.sort.key === c.key ? (state.sort.dir > 0 ? 'ascending' : 'descending') : null },
      el('button', { type: 'button', onclick: () => { state.sort = { key: c.key, dir: state.sort.key === c.key ? -state.sort.dir : 1 }; render(); } },
        c.label, state.sort.key === c.key ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : ''))));
    const body = el('tbody');
    for (const r of list.slice(0, showLimit)) {
      const tr = el('tr', { class: r.flags.includes(FLAG_CRIT) ? 'flag-crit' : r.flags.includes(FLAG_WARN) ? 'flag-warn' : null, onclick: () => openDrawer(r._id) });
      for (const c of TCOLS) {
        let cell;
        if (c.key === 'dwg') cell = el('td', null, el('button', { class: 'dwg', type: 'button', onclick: ev => { ev.stopPropagation(); openDrawer(r._id); } }, hl(r.dwg, tokens)));
        else if (c.key === 'flags') cell = el('td', null, flagBadges(r));
        else if (c.f) cell = el('td', null, hl(text(r[c.key]) || '—', tokens));
        else if (c.r) cell = el('td', { class: 'r' }, c.key === 'qty' ? fmt(r.qty, 0) : fmt(r[c.key], c.key === 'unitW' ? 3 : 2));
        else cell = el('td', null, c.get ? c.get(r) : hl(text(r[c.key]) || '—', tokens));
        tr.append(cell);
      }
      body.append(tr);
    }
    $('#table').replaceChildren(el('thead', null, head), body);
    const foot = $('#tfoot');
    if (!list.length) foot.replaceChildren(el('div', { class: 'empty' }, '沒有符合的資料。', el('button', { class: 'linkbtn', type: 'button', text: '清除全部篩選', onclick: clearAll })));
    else if (list.length > showLimit) foot.replaceChildren(el('div', { class: 'tfoot' }, el('button', { class: 'btn', type: 'button', text: `再顯示 ${Math.min(TABLE_PAGE, list.length - showLimit)} 筆`, onclick: () => { showLimit += TABLE_PAGE; render(); } })));
    else foot.replaceChildren();
  }

  function flagBadges(r) {
    const out = [];
    if (r.flags.includes(FLAG_CRIT)) out.push(el('span', { class: 'badge crit' }, '⛔ ', FLAG_CRIT));
    if (r.flags.includes(FLAG_WARN)) out.push(el('span', { class: 'badge warn' }, '⚠ ', FLAG_WARN));
    if (!out.length) out.push(el('span', { class: 'badge ok', text: '正常' }));
    return out;
  }

  // ---------- 詳細規格表（抽屜） ----------
  let drawerRow = null;
  function openDrawer(id) {
    drawerRow = id;
    closeDrawerNodes();
    const r = rows.find(x => x._id === id);
    if (!r) return;
    const back = el('div', { class: 'backdrop', onclick: closeDrawer });
    const d = el('aside', { class: 'drawer', id: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${r.dwg} 包裝規格` },
      el('div', { class: 'drawer-h' },
        el('div', { class: 'row1' },
          el('div', null, el('h2', { text: r.dwg || '（無圖號）' }), el('div', { class: 'meta', text: [r.cust, r.spec, r.mat].filter(Boolean).join('・') })),
          el('div', { class: 'spacer' }),
          el('div', { class: 'acts' }, el('button', { class: 'btn sm', type: 'button', text: '列印', onclick: printDrawer })),
          el('button', { class: 'x', type: 'button', 'aria-label': '關閉', text: '×', onclick: closeDrawer })),
        el('div', { class: 'drawer-nav', id: 'dnav' })),
      el('div', { class: 'drawer-b' }, checks(r), paperForm(r), similar(r)));
    document.body.append(back, d);
    refreshDrawerNav();
    d.querySelector('.x').focus();
  }
  function refreshDrawerNav() {
    const nav = $('#dnav');
    if (!nav) return;
    const sorted = lastSorted;
    const i = sorted.findIndex(r => r._id === drawerRow);
    const go = j => openDrawer(sorted[j]._id);
    nav.replaceChildren(
      el('button', { class: 'btn sm', type: 'button', text: '← 上一筆', disabled: i <= 0, onclick: () => go(i - 1) }),
      el('button', { class: 'btn sm', type: 'button', text: '下一筆 →', disabled: i < 0 || i >= sorted.length - 1, onclick: () => go(i + 1) }),
      el('span', { text: i >= 0 ? `目前篩選結果的第 ${i + 1} ／ ${sorted.length} 筆（鍵盤 ← → 也可以）` : '這筆不在目前的篩選結果裡' }));
  }
  function closeDrawerNodes() { document.querySelectorAll('.backdrop, .drawer').forEach(n => n.remove()); }
  function closeDrawer() { drawerRow = null; closeDrawerNodes(); }
  function printDrawer() {
    document.body.classList.add('print-detail');
    window.print();
  }
  addEventListener('afterprint', () => document.body.classList.remove('print-detail'));

  function checks(r) {
    const out = [];
    if (r.flags.includes(FLAG_CRIT)) out.push(el('div', { class: 'alert crit' }, el('b', { text: '⛔ 外銷超重' }),
      `總重 ${fmt(r.total)} kg，超過外銷限重 ${LIMIT_KG}KG ${fmt(r.total - LIMIT_KG)} kg。`, r.market ? '' : '（出貨別沒填，先當外銷檢查。）',
      isNum(r.unitW) && r.unitW > 0 ? `若要壓在 ${LIMIT_KG}KG 內，一箱最多約 ${Math.floor((LIMIT_KG - (isNum(r.packW) ? r.packW : 0)) / r.unitW)} 支。` : ''));
    if (r.flags.includes(FLAG_WARN)) out.push(el('div', { class: 'alert warn' }, el('b', { text: '⚠ 重量對不上' }),
      `單支 ${fmt(r.unitW, 3)} × ${fmt(r.qty, 0)} 支 ＋ 包材 ${fmt(r.packW)} = ${fmt(r._calc)} kg，但表上總重是 ${fmt(r.total)} kg（差 ${fmt(r.total - r._calc)} kg）。請確認哪一個數字填錯。`));
    if (!out.length) out.push(el('div', { class: 'alert ok' }, el('b', { text: '✓ 檢查通過' }),
      r._calc != null ? `單支 × 數量 ＋ 包材 = ${fmt(r._calc)} kg，與總重相符` : '重量欄位不完整，無法驗算', r.market === '外銷' ? `；外銷限重 ${LIMIT_KG}KG 內。` : '。'));
    return out;
  }

  function optLine(key, selected) {
    const std = OPTIONS[key] || [];
    const sel = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    const items = std.map(o => el('span', { class: `opt ${sel.includes(o) ? 'on' : ''}`, text: `${sel.includes(o) ? '☑' : '☐'} ${o}` }));
    for (const v of sel) if (!std.includes(v)) items.push(el('span', { class: 'opt on extra', title: '不在範本的標準選項裡', text: `☑ ${v}（其他）` }));
    return el('div', { class: 'opts' }, items);
  }
  function paperForm(r) {
    const R = (k, v) => el('div', { class: 'r' }, el('div', { text: k }), el('div', null, v));
    const plain = v => el('span', { text: text(v) || '—' });
    return el('div', { class: 'pf' },
      el('div', { class: 'part', text: '一、基本資訊' }),
      R('客戶名稱', plain(r.cust)), R('材質', plain(r.mat)), R('圖號', plain(r.dwg)), R('規格', plain(r.spec)),
      R('表面處理', optLine('surf', r.surf)), R('出貨別', optLine('market', r.market)),
      el('div', { class: 'part', text: '二、包裝方式確認' }),
      R('包材種類', optLine('box', r.box)),
      R('包材尺寸', el('div', null, el('div', { class: 'num', text: [r.L, r.W, r.H].some(isNum) ? `長 ${fmt(r.L, 1)} × 寬 ${fmt(r.W, 1)} × 高 ${fmt(r.H, 1)} cm` : '—' }), optLine('sizeType', r.sizeType))),
      R('緩衝包材', optLine('cushion', r.cushion)), R('膠帶材質', optLine('tape', r.tape)), R('封口機', optLine('sealer', r.sealer)),
      R('封箱方式', optLine('seal', r.seal)), R('貼箱位置', optLine('label', r.label)), R('包裝圖／圖面', optLine('drawing', r.drawing)),
      el('div', { class: 'part', text: '三、⚠ 特別要求／備註' }),
      el('div', { class: 'r' }, el('div', { text: '備註' }), el('div', null, r.notes.length ? el('ol', { style: 'margin:0;padding-left:1.2rem' }, r.notes.map(n => el('li', { text: n }))) : '—')),
      el('div', { class: 'part', text: '四、數量和重量' }),
      el('div', { class: 'w4' },
        el('div', null, '單支重量', el('b', { text: `${fmt(r.unitW, 3)} kg` })), el('div', null, '一箱數量', el('b', { text: `${fmt(r.qty, 0)} 支` })),
        el('div', null, '包材重量', el('b', { text: `${fmt(r.packW)} kg` })), el('div', null, '總重', el('b', { text: `${fmt(r.total)} kg` }))),
      el('div', { class: 'part', text: '六、附件檢附' }),
      R('附件', optLine('attach', r.attach)),
      R('核定／修改', plain([r.approved && `核定 ${r.approved}`, r.revised && `修改 ${r.revised}`, r.ver && `第 ${r.ver} 版`].filter(Boolean).join('　'))),
    );
  }
  function similar(r) {
    const same = rows.filter(x => x._id !== r._id && x.spec && x.spec === r.spec).slice(0, 8);
    if (!same.length) return null;
    return el('div', { class: 'sim' },
      el('h3', { text: `同規格「${r.spec}」的其他品項怎麼包（${same.length} 筆）` }),
      el('div', { class: 'tscroll' }, el('table', null,
        el('thead', null, el('tr', null, ['圖號', '客戶', '材質', '包材', '封箱', '一箱數量', '總重 kg'].map(h => el('th', { text: h })))),
        el('tbody', null, same.map(x => el('tr', { onclick: () => openDrawer(x._id) },
          el('td', null, el('button', { class: 'dwg', type: 'button', text: x.dwg })), el('td', { text: x.cust || '—' }), el('td', { text: x.mat || '—' }),
          el('td', { text: text(x.box) || '—' }), el('td', { text: text(x.seal) || '—' }), el('td', { class: 'r', text: fmt(x.qty, 0) }), el('td', { class: 'r', text: fmt(x.total) })))))));
  }

  // ---------- Excel 函式庫（用到才載入，檔案放在本站，不連外） ----------
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxP || (xlsxP = new Promise((ok, fail) => {
      const s = el('script', { src: 'vendor/xlsx.full.min.js' });
      s.onload = () => window.XLSX ? ok(window.XLSX) : fail(new Error('Excel 函式庫載入後找不到 XLSX'));
      s.onerror = () => { xlsxP = null; fail(new Error('Excel 函式庫（vendor/xlsx.full.min.js）載入失敗')); };
      document.head.append(s);
    }));
  }

  // ---------- 匯入 ----------
  const MARK_ON = /[■☑✓✔√✅VvＶｖ]/;
  const normH = h => String(h ?? '').replace(/[\s　]/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/kg|cm/gi, '').toLowerCase();
  const HEAD = new Map();
  for (const c of COLS) for (const n of [c.label, ...(c.aliases || [])]) HEAD.set(normH(n), c.key);
  const splitMulti = v => String(v).split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean);
  const splitList = v => String(v).split(/[\n；;]+/).map(s => s.trim()).filter(Boolean);
  function parseNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v ?? '').replace(/[,，\s]/g, '').replace(/[０-９．]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    if (!s) return null;
    const m = s.match(/^-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }
  function fmtDate(v) {
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    return String(v ?? '').trim();
  }
  function coerce(col, v, issue) {
    if (v == null || v === '') return col.type === 'multi' || col.type === 'list' ? [] : col.type === 'num' ? null : '';
    switch (col.type) {
      case 'num': {
        const n = parseNum(v);
        if (Number.isNaN(n)) { issue('warn', `「${col.label}」不是數字：${v}（已當作空白）`); return null; }
        return n;
      }
      case 'multi': return splitMulti(v);
      case 'list': return splitList(v);
      case 'date': return fmtDate(v);
      default: return String(v).trim();
    }
  }

  function parseTable(XLSX, ws, where, issues) {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    let hr = -1;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) if (aoa[i].some(h => HEAD.get(normH(h)) === 'dwg')) { hr = i; break; }
    if (hr < 0) { issues.push({ lv: 'info', where, msg: '找不到「圖號」欄，這張工作表略過' }); return []; }
    const map = aoa[hr].map(h => HEAD.get(normH(h)) || null);
    aoa[hr].forEach((h, i) => { if (String(h).trim() && !map[i]) issues.push({ lv: 'info', where, msg: `不認得的欄位「${h}」，已略過` }); });
    const out = [];
    for (let i = hr + 1; i < aoa.length; i++) {
      const line = aoa[i];
      if (!line.some(v => String(v).trim() !== '')) continue;
      const w = `${where} 第 ${i + 1} 列`;
      const rec = {};
      map.forEach((k, j) => { if (k) rec[k] = coerce(COL[k], line[j], (lv, msg) => issues.push({ lv, where: w, msg })); });
      if (!rec.dwg) { issues.push({ lv: 'err', where: w, msg: '沒有圖號，這列略過' }); continue; }
      out.push(finish(rec, w, issues));
    }
    return out;
  }

  // 公司正式《包裝規格表》版面（一張工作表 = 一個品項）
  const cellT = (ws, a) => { const c = ws[a]; if (!c) return ''; return c.v instanceof Date ? fmtDate(c.v) : String(c.v ?? '').trim(); };
  const isForm = ws => cellT(ws, 'A1').includes('包裝規格表') && cellT(ws, 'A4').includes('客戶');
  const clean = s => String(s || '').replace(/[＿_]+/g, '').trim();
  function parseOpts(str) {
    const out = [];
    for (const tok of String(str || '').split(/　|\s{2,}/)) {
      const m = tok.trim().match(/^([□☐■☑✓✔√✅VvＶｖ]*)\s*(.*)$/);
      if (!m || !m[2] || !MARK_ON.test(m[1])) continue;
      const [base, ...rest] = m[2].split(/[：:]/);
      out.push({ base: base.replace(/＿+/g, '').trim(), detail: clean(rest.join('：')) });
    }
    return out;
  }
  const afterColon = s => clean(String(s || '').split(/[：:]/).slice(1).join('：'));
  function parseForm(ws, where, issues) {
    const t = a => cellT(ws, a);
    const first = (...a) => a.map(t).map(clean).find(Boolean) || '';
    const rec = { notes: [] };
    rec.cust = first('B4', 'C4');
    rec.mat = first('E4', 'F4');
    rec.dwg = first('B5', 'C5');
    rec.spec = first('E5', 'F5');
    const pick = (key, cell, rename = {}) => {
      const got = parseOpts(t(cell)).map(o => {
        let v = rename[o.base] || o.base;
        if (v === '其他') v = o.detail || '其他';
        else if (o.detail) rec.notes.push(`${COL[key].label}：${v} ${o.detail}`);
        return v.replace(/（/g, '(').replace(/）/g, ')');
      });
      return got;
    };
    rec.surf = pick('surf', 'B6');
    rec.box = pick('box', 'B8', { '客戶指定其他': '客戶指定' })[0] || '';
    const size = t('B9');
    const n = re => { const m = size.match(re); return m ? Number(m[1]) : null; };
    rec.L = n(/長[：:]\s*([\d.]+)/); rec.W = n(/寬[：:]\s*([\d.]+)/); rec.H = n(/高[：:]\s*([\d.]+)/);
    rec.sizeType = pick('sizeType', 'B10')[0] || '';
    rec.cushion = pick('cushion', 'B11', { 'PE袋規格': 'PE袋' });
    rec.tape = pick('tape', 'B12');
    rec.sealer = pick('sealer', 'B13')[0] || '';
    rec.seal = [];
    for (const [cell, v] of [['A15', 'H型'], ['A16', '十字型'], ['A17', '打包機防護']]) if (parseOpts(t(cell)).length) rec.seal.push(v);
    if (parseOpts(t('A18')).length) rec.seal.push(afterColon(t('B18')) || '其他');
    rec.label = pick('label', 'B19');
    rec.drawing = pick('drawing', 'B20')[0] || '';
    for (const a of ['A22', 'A23', 'A24', 'A25', 'A26']) { const s = clean(t(a).replace(/^\d+\.\s*/, '')); if (s) rec.notes.push(s); }
    const num = (cell, label) => { const v = parseNum(ws[cell] ? ws[cell].v : ''); if (Number.isNaN(v)) { issues.push({ lv: 'warn', where, msg: `「${label}」不是數字：${t(cell)}` }); return null; } return v; };
    rec.unitW = num('B29', '單支重量'); rec.total = num('D29', '總重'); rec.qty = num('F29', '一箱數量'); rec.packW = num('B30', '包材重量');
    rec.attach = pick('attach', 'A34');
    rec.approved = afterColon(t('A36')) || first('B36', 'C36');
    rec.revised = afterColon(t('D36')) || first('E36', 'F36');
    if (rec.tape.includes('外銷膠帶')) { rec.market = '外銷'; issues.push({ lv: 'info', where, msg: '表單沒有「出貨別」欄，因為勾了「外銷膠帶」所以當作外銷' }); }
    if (!rec.dwg) { issues.push({ lv: 'err', where, msg: '圖號是空的，這張表略過' }); return []; }
    if (!rec.seal.length) issues.push({ lv: 'warn', where, msg: '封箱方式沒有勾選' });
    return [finish(rec, where, issues)];
  }

  function finish(rec, where, issues) {
    for (const [k, opts] of Object.entries(OPTIONS)) {
      if (k === 'seal' && rec.seal) continue; // 封箱「其他」本來就是自由文字
      for (const v of [].concat(rec[k] || [])) if (v && !opts.includes(v)) issues.push({ lv: 'info', where, msg: `${COL[k].label}「${v}」不在範本的選項裡（照樣收錄）` });
    }
    if (rec.total == null) issues.push({ lv: 'warn', where, msg: '沒有總重，無法做 20KG 檢查' });
    return rec;
  }

  async function decodeCSV(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('big5').decode(buf); }
  }

  async function importFiles(files) {
    files = [...files].filter(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    if (!files.length) { toast('只收 .xlsx／.xls／.csv 檔'); return; }
    let XLSX;
    try { XLSX = await loadXLSX(); } catch (e) { alert(e.message + '\n\n請確認網站檔案完整，或重新整理再試一次。'); return; }
    const issues = [], got = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = /\.csv$/i.test(f.name) ? XLSX.read(await decodeCSV(buf), { type: 'string', raw: false }) : XLSX.read(buf, { type: 'array', cellDates: true });
        let before = got.length;
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const where = wb.SheetNames.length > 1 ? `${f.name}／${name}` : f.name;
          got.push(...(isForm(ws) ? parseForm(ws, where, issues) : parseTable(XLSX, ws, where, issues)));
        }
        if (got.length === before) issues.push({ lv: 'err', where: f.name, msg: '這個檔案沒有讀到任何品項' });
      } catch (e) {
        issues.push({ lv: 'err', where: f.name, msg: `讀不了這個檔案：${e.message}` });
      }
    }
    const seen = new Map();
    for (const r of got) seen.set(r.dwg, (seen.get(r.dwg) || 0) + 1);
    for (const [d, c] of seen) if (c > 1) issues.push({ lv: 'warn', where: '全部檔案', msg: `圖號「${d}」出現 ${c} 次，都先收錄，請確認是不是重複` });
    showReport(files, got, issues);
  }

  function showReport(files, got, issues) {
    const order = { err: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.lv] - order[b.lv]);
    const lvText = { err: '錯誤', warn: '注意', info: '提醒' };
    const count = lv => issues.filter(i => i.lv === lv).length;
    const remember = el('input', { type: 'checkbox', id: 'remember', checked: true });
    const dlg = el('dialog', { 'aria-label': '匯入結果' },
      el('div', { class: 'dlg-h' }, el('h2', { style: 'font-size:1.15rem', text: '匯入結果' })),
      el('div', { class: 'dlg-b' },
        el('div', null, el('span', { class: 'big', text: String(got.length) }), ` 筆品項，來自 ${files.length} 個檔案`),
        el('p', { class: 'hint', style: 'margin:.3rem 0 0', text: `錯誤 ${count('err')}・注意 ${count('warn')}・提醒 ${count('info')}` }),
        issues.length ? el('ul', { class: 'issues' }, issues.slice(0, 150).map(i => el('li', null,
          el('span', { class: `lv ${i.lv}`, text: lvText[i.lv] }), el('span', null, el('span', { class: 'where', text: i.where + '　' }), i.msg)))) : el('p', { text: '✓ 全部欄位都讀得懂，沒有任何問題。' }),
        issues.length > 150 ? el('p', { class: 'hint', text: `……另外還有 ${issues.length - 150} 則沒有列出` }) : null),
      el('div', { class: 'dlg-f' },
        el('label', { class: 'hint', style: 'display:flex;gap:.35rem;align-items:center' }, remember, '記在這台電腦（下次打開直接用）'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', text: '取消', onclick: () => dlg.close() }),
        source.kind === 'mine' && got.length ? el('button', { class: 'btn', type: 'button', text: '加到現有資料', onclick: () => apply(true) }) : null,
        got.length ? el('button', { class: 'btn primary', type: 'button', text: source.kind === 'mine' ? '取代現有資料' : '開始使用', onclick: () => apply(false) }) : null));
    function apply(append) {
      const list = append ? [...raw, ...got] : got;
      const label = append ? `${source.label}＋${files.map(f => f.name).join('、')}` : files.map(f => f.name).join('、');
      const src = { kind: 'mine', label, savedAt: Date.now(), saved: false };
      if (remember.checked) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ label, savedAt: src.savedAt, rows: list })); src.saved = true; }
        catch { toast('這台電腦的瀏覽器不允許儲存，這次先用，但重新整理後會消失'); }
      } else { try { localStorage.removeItem(STORE_KEY); } catch { /* 無法存取就算了 */ } }
      dlg.close();
      closeDrawer();
      setData(list, src);
      render();
      toast(`已載入 ${list.length} 筆`);
    }
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function clearMine() {
    if (!confirm('要清除這台電腦上記住的資料，回到示範資料嗎？（你的 Excel 原檔不受影響）')) return;
    try { localStorage.removeItem(STORE_KEY); } catch { /* 無法存取就算了 */ }
    closeDrawer();
    setData(window.DONG_DEMO || [], { kind: 'demo', label: '示範資料' });
    render();
  }

  // ---------- 範本、匯出 ----------
  const toCells = r => COLS.map(c => { const v = r[c.key]; return Array.isArray(v) ? v.join(c.type === 'list' ? '；' : '、') : (v ?? ''); });
  function sheetFrom(XLSX, aoa, widths) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    return ws;
  }
  const widths = COLS.map(c => c.type === 'num' ? 11 : c.key === 'notes' ? 36 : c.key === 'spec' ? 22 : 14);
  async function downloadTemplate() {
    let XLSX; try { XLSX = await loadXLSX(); } catch (e) { alert(e.message); return; }
    const wb = XLSX.utils.book_new();
    const sample = (window.DONG_DEMO || []).slice(0, 3);
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, [COLS.map(c => c.label), ...sample.map(toCells)], widths), '規格總表');
    const help = [['欄位', '說明', '可用選項（多選用「、」分隔）'], ...COLS.map(c => [c.label, [c.required ? '必填' : '', c.help || ''].filter(Boolean).join('；'), (OPTIONS[c.key] || []).join('、')]),
      [], ['', '前三列是虛構的示範資料，請刪掉後填入你們的資料。'], ['', '也可以直接把公司的《包裝規格表》Excel（一張一個品項）拖進查詢頁，系統會自動讀取。']];
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, help, [14, 34, 48]), '填寫說明');
    XLSX.writeFile(wb, '包裝規格總表範本.xlsx');
  }
  async function exportFiltered() {
    if (!lastSorted.length) { toast('目前沒有資料可匯出'); return; }
    let XLSX; try { XLSX = await loadXLSX(); } catch (e) { alert(e.message); return; }
    const wb = XLSX.utils.book_new();
    const aoa = [[...COLS.map(c => c.label), '檢查結果'], ...lastSorted.map(r => [...toCells(r), r.flags.join('、')])];
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, aoa, [...widths, 14]), '篩選結果');
    const d = new Date();
    XLSX.writeFile(wb, `包裝規格_篩選結果_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
  }

  function clearAll() { change(() => { state.q = ''; state.sel = {}; state.bins = new Set(); $('#q').value = ''; }); }

  // ---------- 事件 ----------
  let qTimer;
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); const v = e.target.value.trim(); qTimer = setTimeout(() => change(() => { state.q = v; }), 150); });
  $('#btn-undo').addEventListener('click', () => { if (undoStack.length) { restore(undoStack.pop()); render(); } });
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('已複製連結。對方打開會看到同樣的篩選（資料用他自己電腦上的）'); }
    catch { prompt('複製這個連結：', location.href); }
  });
  $('#btn-load').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', e => { if (e.target.files.length) importFiles(e.target.files); e.target.value = ''; });
  $('#btn-template').addEventListener('click', downloadTemplate);
  $('#btn-export').addEventListener('click', exportFiltered);

  let dragDepth = 0, dropNode = null;
  addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); if (dragDepth++ === 0) { dropNode = el('div', { class: 'drop' }, el('div', { text: '放開就載入（Excel／CSV，可一次多個）' })); document.body.append(dropNode); } });
  addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropNode?.remove(); } });
  addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; dropNode?.remove(); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });

  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); return; }
    if (e.key === 'Escape') { if (drawerRow != null) closeDrawer(); else if (typing && state.q) { $('#q').value = ''; change(() => { state.q = ''; }); } return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); $('#btn-undo').click(); return; }
    if (drawerRow != null && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const i = lastSorted.findIndex(r => r._id === drawerRow);
      const j = i + (e.key === 'ArrowRight' ? 1 : -1);
      if (i >= 0 && j >= 0 && j < lastSorted.length) openDrawer(lastSorted[j]._id);
    }
  });
  addEventListener('scroll', hideTip, { passive: true });

  // ---------- 啟動 ----------
  try {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { saved = null; }
    if (saved && Array.isArray(saved.rows) && saved.rows.length) setData(saved.rows, { kind: 'mine', label: saved.label, savedAt: saved.savedAt, saved: true });
    else if (Array.isArray(window.DONG_DEMO)) setData(window.DONG_DEMO, { kind: 'demo', label: '示範資料' });
    else throw new Error('示範資料（assets/demo-data.js）沒有載入');
    readHash();
    render();
  } catch (e) {
    $('#app').prepend(el('div', { class: 'fatal', role: 'alert' }, el('b', { text: '查詢頁啟動失敗：' }), e.message));
    console.error(e);
  }
})();

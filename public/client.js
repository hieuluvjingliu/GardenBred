const $ = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
let state = null;
let currentFloorIdx = 0;
let floorActionSel = {}; // { [floorId]: {slot, potId, seedId} }

// === Caches để không reset số lượng khi refresh ===
const seedQtyCache = {}; // { [class]: "value-as-string" }
const potQtyCache  = {}; // { [type]:  "value-as-string" }
function getCachedQty(cache, key, fallback=1){
  const v = parseInt(cache[key], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// ---- MUTATION META (client-side only) ----
const MUT_INFO = {
  green:   { name:'green',   mult:1.2,  color:'#35e08a' },
  blue:    { name:'blue',    mult:1.5,  color:'#3b82f6' },
  yellow:  { name:'yellow',  mult:2.0,  color:'#facc15' },
  pink:    { name:'pink',    mult:3.0,  color:'#ec4899' },
  red:     { name:'red',     mult:4.0,  color:'#ef4444' },
  gold:    { name:'gold',    mult:6.0,  color:'#f59e0b' },
  rainbow: { name:'rainbow', mult:11.0, color:'#a78bfa' }
};
function getMutationMeta(obj){
  const key = obj?.mutation || obj?.mutation_name;
  if (!key) return null;
  const meta = MUT_INFO[key] || null;
  if (!meta) return null;
  return {
    key,
    name: obj?.mutation_name || meta.name,
    mult: Number.isFinite(obj?.mutation_mult) ? obj.mutation_mult : meta.mult,
    color: obj?.mutation_color || obj?.mutation_hex || meta.color
  };
}

// --- Helper badge mutation cho khu Breed result ---
function renderMutationBadge(mut){
  const key = mut || 'normal';
  const cls = {
    green:'mut-green', blue:'mut-blue', yellow:'mut-yellow',
    pink:'mut-pink', red:'mut-red', gold:'mut-gold',
    rainbow:'mut-rainbow', normal:'mut-normal'
  }[key] || 'mut-normal';
  return `<span class="badge ${cls}">${key}</span>`;
}

function setActive(tab){
  $$('.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.tab').forEach(sec=>sec.classList.toggle('hidden', sec.id!==tab));
}
function showApp(){
  $('#auth').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#tabs').classList.remove('hidden');
  setActive('shop');
}

/* ---------------- API ---------------- */
async function api(path, body){
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });

  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || res.statusText }; }

  if (!res.ok) {
    const err = {
      status: res.status,
      statusText: res.statusText,
      error: data?.error || 'Unknown error',
      details: data,
      _raw: raw
    };
    throw err;
  }
  return data;
}
function showError(e, context=''){
  const title = context ? `[${context}] ` : '';
  const msg = `${title}${e?.error || e?.message || 'error'}`
            + (e?.status ? ` (HTTP ${e.status})` : '');
  alert(msg);
  console.error('API error:', {
    context,
    status: e?.status,
    statusText: e?.statusText,
    error: e?.error,
    details: e?.details,
    raw: e?._raw
  });
}
async function get(path){
  const res = await fetch(path);
  if(!res.ok) throw await res.json();
  return res.json();
}

/* ---------- HELPERS ---------- */
function preserveSelectValue(sel, fillFn){
  if(!sel) return;
  const old = sel.value;
  fillFn();
  if (old && Array.from(sel.options).some(o=>o.value===old)) sel.value = old;
}
function snapshotFloorActionSelections(){
  floorActionSel = {};
  $$('#floors .floor').forEach(f=>{
    const floorId = +f.dataset.floorId;
    const act = f.querySelector('.floor-actions');
    if (!act) return;
    const slot   = act.querySelector('.sel-slot')?.value;
    const potId  = act.querySelector('.sel-pot')?.value;
    const seedId = act.querySelector('.sel-seed')?.value;
    floorActionSel[floorId] = { slot, potId, seedId };
  });
}
function restoreFloorActionSelections(){
  Object.entries(floorActionSel).forEach(([fid, sel])=>{
    const f = $(`#floors .floor[data-floor-id="${fid}"]`);
    if (!f) return;
    const act = f.querySelector('.floor-actions');
    if (!act) return;

    const slotSel = act.querySelector('.sel-slot');
    const potSel  = act.querySelector('.sel-pot');
    const seedSel = act.querySelector('.sel-seed');

    if (slotSel && sel.slot && Array.from(slotSel.options).some(o=>o.value===sel.slot))
      slotSel.value = sel.slot;
    if (potSel && sel.potId && Array.from(potSel.options).some(o=>o.value===sel.potId))
      potSel.value = sel.potId;
    if (seedSel && sel.seedId && Array.from(seedSel.options).some(o=>o.value===sel.seedId))
      seedSel.value = sel.seedId;
  });
}

/* ---------- SHOP (ảnh) ---------- */
function buildQtyControl({cache, key, onChange}){
  const wrap = document.createElement('div');
  wrap.className = 'qty';
  const minus = document.createElement('button'); minus.type='button'; minus.textContent='–';
  const input = document.createElement('input');
  input.type = 'number'; input.min = '1'; input.inputMode = 'numeric';
  input.value = getCachedQty(cache, key, 1);
  const plus = document.createElement('button'); plus.type='button'; plus.textContent='+';

  const syncCache = ()=>{
    const v = parseInt(input.value,10);
    cache[key] = (Number.isFinite(v) && v>0) ? String(v) : '1';
    if (typeof onChange === 'function') onChange(cache[key]);
  };
  input.addEventListener('input', syncCache);
  input.addEventListener('focus', ()=>{ wrap.dataset.focused='1'; });
  input.addEventListener('blur', ()=>{ delete wrap.dataset.focused; });

  minus.addEventListener('click', ()=>{
    const v = Math.max(1, (parseInt(input.value,10)||1)-1);
    input.value = v; syncCache();
  });
  plus.addEventListener('click', ()=>{
    const v = Math.max(1, (parseInt(input.value,10)||1)+1);
    input.value = v; syncCache();
  });

  wrap.append(minus, input, plus);
  return { wrap, input };
}

function renderShop(){
  const seedGrid = $('#seedShopGrid'); if (!seedGrid) return;
  seedGrid.innerHTML='';
  ['fire','water','wind','earth'].forEach(cls=>{
    const el = document.createElement('div');
    el.className='item';

    const img = document.createElement('img');
    img.src = `/assets/Seed_Planted/seed_planted_${cls}.png`;
    img.loading = 'lazy';
    img.onerror = ()=>{ img.replaceWith(Object.assign(document.createElement('div'),{textContent:cls.toUpperCase(),style:'height:72px;display:flex;align-items:center;justify-content:center'})); };

    const lbl = document.createElement('span'); lbl.className='label'; lbl.textContent = cls;

    const { wrap: qtyWrap, input: qtyInput } = buildQtyControl({
      cache: seedQtyCache, key: cls
    });

    const btn = document.createElement('button');
    btn.textContent = `Buy ${cls} (100)`;
    btn.addEventListener('click', async ()=>{
      const qty = Math.max(1, parseInt(qtyInput.value,10) || 1);
      seedQtyCache[cls] = String(qty);
      try{
        await api('/shop/buy',{ itemType:'seed', classOrType: cls, qty });
        await refresh();
      }catch(e){ showError(e,'buy-seed'); }
    });

    el.append(img, lbl, qtyWrap, btn);
    seedGrid.appendChild(el);
  });

  const potGrid = $('#potShopGrid'); if (!potGrid) return; potGrid.innerHTML='';
  const potDefs = [
    {type:'basic', img:'pot1.png', label:'Basic (100)'},
    {type:'gold', img:'pot2.png', label:'Gold +50% (300)'},
    {type:'timeskip', img:'pot3.png', label:'Time Skip +50% (300)'}
  ];
  potDefs.forEach(p=>{
    const el=document.createElement('div'); el.className='item';

    const img = document.createElement('img'); img.src = `/assets/Pots_Image/${p.img}`;
    img.loading = 'lazy';
    img.onerror = ()=>{ img.replaceWith(Object.assign(document.createElement('div'),{textContent:p.type,style:'height:72px;display:flex;align-items:center;justify-content:center'})); };

    const lbl = document.createElement('span'); lbl.className='label'; lbl.textContent = p.type;

    const { wrap: qtyWrap, input: qtyInput } = buildQtyControl({
      cache: potQtyCache, key: p.type
    });

    const btn = document.createElement('button'); btn.textContent = p.label;
    btn.addEventListener('click', async ()=>{
      const qty = Math.max(1, parseInt(qtyInput.value,10) || 1);
      potQtyCache[p.type] = String(qty);
      try{
        await api('/shop/buy',{ itemType:'pot', classOrType:p.type, qty });
        await refresh();
      }catch(e){ showError(e,'buy-pot'); }
    });

    el.append(img,lbl,qtyWrap,btn);
    potGrid.appendChild(el);
  });
}

/* ---------- MARKET ---------- */
function renderMarketListings(){
  const ul = document.getElementById('marketList');
  if (!ul) return;

  const listings = state?.market || [];
  ul.innerHTML = '';

  if (!listings.length){
    ul.innerHTML = '<li><small>Chưa có món nào được rao.</small></li>';
    return;
  }

  listings.forEach(L=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="listing-row">
        <div class="l-col"><span class="muted">#${L.id}</span> <b>${L.class}</b></div>
        <div class="l-col price"><span class="coin-ico"></span> <b>${L.ask_price}</b></div>
        <div class="l-col muted">base ${L.base_price}</div>
        <button class="buy buy-listing" data-id="${L.id}">Buy</button>
      </div>`;
    ul.appendChild(li);
  });
}

/* ---------- DATA HELPERS ---------- */
function groupMatureByClass(){
  const by = {};
  (state?.seedInv||[]).filter(s=>s.is_mature===1).forEach(s=>{ by[s.class] = (by[s.class]||0)+1; });
  return by;
}

function decorateSeedText(seed) {
  const m = getMutationMeta(seed);
  if (m) return `#${seed.id} ${seed.class} [${m.name} ×${m.mult}]`;
  return `#${seed.id} ${seed.class}`;
}

/* ===== INVENTORY: filters + render + Plant All ===== */
function getInventoryFilters(){
  const st  = ($('#fltInvState')?.value || 'all');
  const cls = ($('#fltInvClass')?.value || 'all');
  const mut = ($('#fltInvMut')?.value || 'all');
  return { st, cls, mut };
}

function seedMatchFilter(s, {st, cls, mut}){
  // state filter
  if (st === 'not' && s.is_mature !== 0) return false;
  if (st === 'mat' && s.is_mature !== 1) return false;
  // class filter
  if (cls !== 'all' && s.class !== cls) return false;
  // mutation filter
  const mKey = s.mutation || s.mutation_name || null;
  if (mut === 'none' && mKey) return false;
  if (mut !== 'all' && mut !== 'none' && mKey !== mut) return false;
  return true;
}

function getFilteredSeedsForInventory(){
  const list = Array.isArray(state?.seedInv) ? state.seedInv.slice() : [];
  const f = getInventoryFilters();
  return list.filter(s => seedMatchFilter(s, f));
}

function ensureInventoryClassOptions(){
  const sel = $('#fltInvClass');
  if (!sel) return;
  const classes = Array.from(new Set((state?.seedInv||[]).map(s=>s.class))).sort();
  preserveSelectValue(sel, ()=>{
    const cur = sel.value;
    sel.innerHTML = '<option value="all">All classes</option>' +
      classes.map(c=>`<option value="${c}">${c}</option>`).join('');
    if (Array.from(sel.options).some(o=>o.value===cur)) sel.value = cur;
  });
}

function renderInventorySeeds(){
  const ul = $('#seedInv'); if (!ul) return;
  const rows = getFilteredSeedsForInventory().filter(s=>s.is_mature===0 || $('#fltInvState')?.value!=='not');
  ul.innerHTML = '';

  if (!rows.length){
    ul.innerHTML = '<li><small>Không có seed phù hợp filter.</small></li>';
    return;
  }

  for (const s of rows){
    const li = document.createElement('li');
    li.className = 'inv-item';
    const m = getMutationMeta(s);

    li.innerHTML = `
      <div class="title">${decorateSeedText(s)}</div>
      <div class="small">base ${s.base_price ?? '-'} • id ${s.id}</div>
    `;

    // badge mutation (nếu có)
    if (m){
      const tag = document.createElement('div');
      tag.className = 'mut-tag';
      tag.textContent = `${m.name} ×${m.mult}`;
      if (m.color){
        tag.style.background = m.color;
        tag.style.color = pickTextColorForBg(m.color);
        tag.style.borderColor = m.color;
        tag.style.boxShadow = `0 0 12px ${m.color}66`;
      }
      li.appendChild(tag);
    }

    ul.appendChild(li);
  }
}

async function plantAllFiltered(){
  // Lấy seeds theo filter, chỉ trồng seeds NOT MATURE
  const seeds = getFilteredSeedsForInventory().filter(s=>s.is_mature===0);
  if (!seeds.length) return alert('Không có seed phù hợp để trồng.');

  // Lấy danh sách plot trống nhưng đã có pot
  const targets = [];
  for (const fp of (state?.plots||[])){
    for (const p of fp.plots){
      if (p.pot_id && p.stage === 'empty'){
        targets.push({ floorId: fp.floor.id, slot: p.slot });
      }
    }
  }
  if (!targets.length) return alert('Không còn slot trống có pot để trồng.');

  let planted = 0;
  // Ghép từng seed vào từng target
  while (targets.length && seeds.length){
    const t = targets.shift();
    const s = seeds.shift();
    try {
      await api('/plot/plant', { floorId: t.floorId, slot: t.slot, seedId: s.id });
      planted++;
    } catch (e) {
      showError(e, 'plant-all');
      // nếu lỗi, thử seed kế tiếp/target kế tiếp
    }
  }

  alert(`Đã trồng ${planted} seed.`);
  await refresh();
}

/* ---------- SELECTS & POPULATE ---------- */
function populateSelects(){
  if (!state) return;

  // Sell (mature only)
  const sellSel = $('#sellSeedSelect');
  if (sellSel){
    preserveSelectValue(sellSel, ()=>{
      sellSel.innerHTML = '';
      state.seedInv.filter(s=>s.is_mature===1).forEach(s=>{
        const o = document.createElement('option');
        o.value = s.id; o.textContent = decorateSeedText(s);
        sellSel.appendChild(o);
      });
    });
  }

  // Market (mature only)
  const listSel = $('#listSeedSelect');
  if (listSel){
    preserveSelectValue(listSel, ()=>{
      listSel.innerHTML = '';
      state.seedInv.filter(s=>s.is_mature===1).forEach(s=>{
        const o = document.createElement('option');
        o.value = s.id; o.textContent = decorateSeedText(s);
        listSel.appendChild(o);
      });
    });

    const priceInput = $('#listPrice');
    const syncHint = ()=>{
      const sid = parseInt(listSel.value,10);
      const seed = (state?.seedInv||[]).find(x=>x.id===sid);
      if (!seed || !priceInput) return;
      const base = seed.base_price || 0;
      const min = Math.floor(base * 0.9);
      const max = Math.floor(base * 1.5);
      priceInput.placeholder = `${min} - ${max}`;
    };
    listSel.addEventListener('change', syncHint);
    setTimeout(syncHint, 0);
  }

  // Mature by class
  const matUl = $('#matureByClass'); 
  if (matUl){
    matUl.innerHTML='';
    const by = groupMatureByClass();
    Object.keys(by).sort().forEach(cls=>{
      const li = document.createElement('li');
      li.dataset.mature = "1";
      li.textContent = `${cls}: ${by[cls]}`;
      matUl.appendChild(li);
    });
  }

  // Breed selects
  const selA = $('#breedSelectA'), selB = $('#breedSelectB');
  if (selA && selB){
    const oldA = selA.value, oldB = selB.value;
    selA.innerHTML=''; selB.innerHTML='';
    state.seedInv.filter(s=>s.is_mature===1).forEach(s=>{
      const oa=document.createElement('option'); oa.value=s.id; oa.textContent=decorateSeedText(s); selA.appendChild(oa);
      const ob=document.createElement('option'); ob.value=s.id; ob.textContent=decorateSeedText(s); selB.appendChild(ob);
    });
    if (Array.from(selA.options).some(o=>o.value===oldA)) selA.value = oldA;
    if (Array.from(selB.options).some(o=>o.value===oldB)) selB.value = oldB;
  }

  // Form cũ (safe)
  const floorSel = $('#plantFloor');
  if (floorSel){
    preserveSelectValue(floorSel, ()=>{
      floorSel.innerHTML='';
      state.floors.forEach(f=>{ const o=document.createElement('option'); o.value=f.id; o.textContent=`Floor ${f.idx}`; floorSel.appendChild(o); });
    });
  }
  const slotSel = $('#plantSlot');
  if (slotSel){
    preserveSelectValue(slotSel, ()=>{
      slotSel.innerHTML=''; for(let i=1;i<=10;i++){ const o=document.createElement('option'); o.value=i; o.textContent=`Slot ${i}`; slotSel.appendChild(o); }
    });
  }
  const potSel = $('#plantPot');
  if (potSel){
    preserveSelectValue(potSel, ()=>{
      potSel.innerHTML=''; state.potInv.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=`#${p.id} ${p.type}`; potSel.appendChild(o); });
    });
  }
  const seedSel = $('#plantSeed');
  if (seedSel){
    preserveSelectValue(seedSel, ()=>{
      seedSel.innerHTML=''; state.seedInv.filter(s=>s.is_mature===0).forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=decorateSeedText(s); seedSel.appendChild(o); });
    });
  }

  // Inventory filter: cập nhật options class + render danh sách
  ensureInventoryClassOptions();
  renderInventorySeeds();
}

function nextFloorPrice(){
  const floors = state?.floors || [];
  const maxIdx = floors.reduce((m,f)=>Math.max(m, f.idx), 0);
  const nextIdx = maxIdx + 1;
  return (nextIdx === 1) ? 0 : nextIdx * 1000;
}
function renderBuyFloorPrice(){
  const el = $('#buyFloorPrice');
  if (!el || !state) return;
  const floors = state.floors||[];
  const maxIdx = floors.reduce((m,f)=>Math.max(m,f.idx),0);
  const nextIdx = maxIdx + 1;
  el.textContent = `Giá mở tầng ${nextIdx}: ${nextFloorPrice()} coins`;
}

// --- helpers để tô màu badge theo mutation ---
function hexToRgb(hex){
  const m = String(hex || '').replace('#','').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if(!m) return {r:0,g:0,b:0};
  let h = m[1];
  if(h.length===3) h = h.split('').map(c=>c+c).join('');
  const n = parseInt(h,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function pickTextColorForBg(hex){
  const {r,g,b} = hexToRgb(hex);
  // relative luminance (WCAG)
  const lum = (0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255));
  return lum > 0.6 ? '#041326' : '#ffffff'; // nền sáng -> chữ sẫm, nền tối -> chữ trắng
}

function addMutationBadge(container, obj) {
  const m = getMutationMeta(obj);
  if (!m) return;

  const badge = document.createElement('div');
  badge.className = 'mut-tag';
  badge.textContent = m.name;
  badge.title = `${m.name} ×${m.mult}`;

  // Tô màu theo mutation
  if (m.color){
    badge.style.background   = m.color;                      // nền đúng màu mutation
    badge.style.color        = pickTextColorForBg(m.color);  // chữ tương phản
    badge.style.borderColor  = m.color;                      // viền cùng màu
    badge.style.boxShadow    = `0 0 12px ${m.color}66`;      // glow nhẹ cùng màu
  }

  container.appendChild(badge);
}

/* ====== HIỂN THỊ 2 TẦNG / TRANG + LƯU localStorage ====== */
const LS_FLOOR_PAGE_KEY = 'floor_page';
let floorPage = 0; // 0-based

function loadFloorPageFromStorage(){
  try{
    const v = parseInt(localStorage.getItem(LS_FLOOR_PAGE_KEY),10);
    if (Number.isFinite(v) && v>=0) floorPage = v;
  }catch{}
}
function saveFloorPageToStorage(){
  try{ localStorage.setItem(LS_FLOOR_PAGE_KEY, String(floorPage)); }catch{}
}
loadFloorPageFromStorage();

function getTotalFloorPagesFromState(s){
  const totalFloors = (s?.plots || []).length;
  return Math.max(1, Math.ceil(totalFloors / 2));
}
function clampFloorPageForState(s){
  const total = getTotalFloorPagesFromState(s);
  if (floorPage >= total) floorPage = total - 1;
  if (floorPage < 0) floorPage = 0;
}
function getVisibleFloorPairs(s){
  const list = s?.plots || [];
  const start = floorPage * 2;
  return list.slice(start, start + 2);
}

/* ====== VIRTUALIZE PLOTS ====== */
/** Set các plot đang “thật sự” nằm trong viewport => tickTimers chỉ cập nhật cho chúng */
const visibleTimerPlots = new Set();
/** Observer để render plot khi cuộn tới (có đệm) */
let plotRenderObserver = null;
/** Observer để theo dõi plot có nằm trong viewport không (cho timer) */
let timerVisObserver = null;

function ensureObservers(){
  if (!plotRenderObserver){
    plotRenderObserver = new IntersectionObserver(entries=>{
      for (const ent of entries){
        const placeholder = ent.target;
        if (!ent.isIntersecting) continue;
        // Lấy data đã gắn sẵn cho placeholder
        const p = placeholder.__plotData;
        if (!p) { plotRenderObserver.unobserve(placeholder); continue; }
        const real = buildPlotElement(p);
        placeholder.replaceWith(real);
        plotRenderObserver.unobserve(placeholder);
        // Bắt đầu quan sát hiển thị cho timer
        timerVisObserver?.observe(real);
      }
    }, { root:null, rootMargin:'400px 0px', threshold:0.01 }); // đệm khoảng 400px theo chiều dọc
  }
  if (!timerVisObserver){
    timerVisObserver = new IntersectionObserver(entries=>{
      for (const ent of entries){
        const el = ent.target;
        if (ent.isIntersecting) {
          visibleTimerPlots.add(el);
          // cập nhật ngay một nhịp để khỏi trống
          updatePlotTimer(el);
        } else {
          visibleTimerPlots.delete(el);
        }
      }
    }, { root:null, rootMargin:'100px 0px', threshold:0.01 });
  }
}

/** Xây 1 placeholder plot để lazy render */
function buildPlotPlaceholder(p){
  const ph = document.createElement('div');
  ph.className = 'plot';
  ph.style.minHeight = '260px';
  ph.innerHTML = `<div class="skeleton" style="height:100%;"></div>`;
  ph.__plotData = p; // gắn tạm dữ liệu để observer lấy
  return ph;
}

/** Xây plot đầy đủ (tách ra để tái dùng) */
function buildPlotElement(p){
  const el=document.createElement('div');
  el.className='plot'; 
  el.dataset.plotId=p.id; 
  el.dataset.stage=p.stage||'empty'; 
  el.dataset.class=p.class||'';
  if(p.mature_at) el.dataset.matureAt=p.mature_at;
  if (p.mutation_name || p.mutation) el.dataset.mutation = p.mutation_name || p.mutation;

  const meta = getMutationMeta(p);
  el.title = meta ? `${p.class} [${meta.name} ×${meta.mult}]` : (p.class || 'empty');

  const stats=document.createElement('div'); 
  stats.className='stats';
  const lines = [];
  lines.push(`<div class="stat cls"><div class="label">Class</div><div class="value">${p.class||'empty'}</div></div>`);
  lines.push(`<div class="stat time"><div class="label">Time left</div><div class="value"></div></div>`);
  if (p.mutation_name || Number.isFinite(p?.mutation_mult)) {
    const mutText = `${p.mutation_name || 'mutation'}${Number.isFinite(p?.mutation_mult) ? ` ×${p?.mutation_mult}` : ''}`;
    lines.push(`<div class="stat mut"><div class="label">Mut</div><div class="value">${mutText}</div></div>`);
  }
  stats.innerHTML = lines.join('');

  const visual=document.createElement('div'); 
  visual.className='visual';
  if(p.pot_type){ 
    const pot=document.createElement('img'); 
    pot.className='pot';
    pot.src=`/assets/Pots_Image/${p.pot_type==='gold'?'pot2.png':(p.pot_type==='timeskip'?'pot3.png':'pot1.png')}`;
    pot.loading = 'lazy';
    visual.appendChild(pot);
  }
  if(p.class&&p.stage){ 
    const folder=p.stage==='planted'?'Seed_Planted':p.stage==='growing'?'Seed_Growing':'Seed_Mature';
    const plant=document.createElement('img'); 
    plant.className='plant';
    plant.src=`/assets/${folder}/seed_${p.stage}_${p.class}.png`;
    plant.loading = 'lazy';
    visual.appendChild(plant);

    addMutationBadge(visual, p);
  }

  el.append(stats,visual); 
  if(p.stage==='mature') el.classList.add('mature'); 

  return el;
}

/** Render danh sách plots với virtualization */
function virtualizePlotsInto(container, plots){
  ensureObservers();
  container.innerHTML = '';
  for (const p of plots){
    const ph = buildPlotPlaceholder(p);
    container.appendChild(ph);
    plotRenderObserver.observe(ph);
  }
}

/* ========== SMOOTH RENDER CONTROL (anti-blink) ========== */
let _lastFloorsSig = '';
function computeFloorsSig(s){
  try{
    const parts = (s?.plots||[]).map(fp=>[
      fp.floor?.id, fp.floor?.idx,
      ...(fp.plots||[]).map(p=>[p.id,p.stage,p.class,p.mature_at,p.pot_type,p.mutation_name,p.mutation_mult])
    ]);
    return JSON.stringify(parts);
  }catch{return '';}
}

/* ---------- RENDER STATE (soft/atomic) ---------- */
function renderState(s, opts = {}){
  state=s;
  ensureFarmAutoControls();

  $('#hudUser').textContent = s.me.username;
  const coinsEl = $('#hudCoins');
  if (coinsEl.textContent !== String(s.me.coins)) {
    coinsEl.textContent = s.me.coins;
    coinsEl.classList.add('updated');
    setTimeout(()=>coinsEl.classList.remove('updated'), 600);
  }

  const priceEl = $('#trapPrice');
  if (priceEl) priceEl.textContent = (s.trapPrice ?? '-');
  const maxEl = $('#trapMax');
  if (maxEl) maxEl.textContent = (s.trapMax ?? '-');

  const floorsDiv=$('#floors');
  if(floorsDiv){
    const newSig = computeFloorsSig(s);
    const shouldRebuildFloors =
      opts.forceFloors === true ||
      !opts.soft ||
      newSig !== _lastFloorsSig;

    if (shouldRebuildFloors){
      snapshotFloorActionSelections();

      // Dùng fragment để thay thế "atomic"
      const frag = document.createDocumentFragment();

      // Giới hạn trang & lấy 2 tầng hiển thị
      clampFloorPageForState(s);
      saveFloorPageToStorage();
      const visibleFloorPairs = getVisibleFloorPairs(s);

      visibleFloorPairs.forEach(fp=>{
        const f=document.createElement('div'); 
        f.className='floor'; 
        f.dataset.floorId=fp.floor.id;
        f.innerHTML=`<h3>Floor ${fp.floor.idx}</h3>`;

        const wrap=document.createElement('div'); 
        wrap.className='plots';

        // === Virtualize ở đây ===
        virtualizePlotsInto(wrap, fp.plots);

        f.appendChild(wrap);

        const act=document.createElement('div'); 
        act.className='floor-actions';
        act.innerHTML=`<span class="floor-tag">Floor ${fp.floor.idx}</span>
          <select class="sel-slot">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>
          <select class="sel-pot">${(s.potInv||[]).map(p=>`<option value="${p.id}">#${p.id} ${p.type}</option>`).join('')}</select>
          <select class="sel-seed">${(s.seedInv||[]).filter(x=>!x.is_mature).map(x=>`<option value="${x.id}">${decorateSeedText(x)}</option>`).join('')}</select>
          <button class="btn-place">Place Pot</button>
          <button class="btn-plant">Plant</button>
          <button class="btn-remove danger">Remove Plot</button>`;
        f.appendChild(act);

        act.addEventListener('change',()=>{
          floorActionSel[fp.floor.id]={
            slot:act.querySelector('.sel-slot')?.value,
            potId:act.querySelector('.sel-pot')?.value,
            seedId:act.querySelector('.sel-seed')?.value
          };
        });

        act.addEventListener('click',async e=>{
          const floorId=fp.floor.id,slot=parseInt(act.querySelector('.sel-slot').value,10);
          if(e.target.closest('.btn-place')){
            const potId=parseInt(act.querySelector('.sel-pot').value,10); if(!potId) return;
            try{await api('/plot/place-pot',{floorId,slot,potId});await refresh();}catch(err){showError(err,'place-pot');}
          }
          if(e.target.closest('.btn-plant')){
            const seedId=parseInt(act.querySelector('.sel-seed').value,10); if(!seedId) return;
            try{await api('/plot/plant',{floorId,slot,seedId});await refresh();}catch(err){showError(err,'plant');}
          }
          if(e.target.closest('.btn-remove')){
            if(!confirm('Xóa ô này?'))return;
            try{await api('/plot/remove',{floorId,slot});await refresh();}catch(err){showError(err,'remove');}
          }
        });

        frag.appendChild(f);
      });

      // Thẻ "Mua tầng" (không phụ thuộc phân trang)
      const maxIdx = (s.floors||[]).reduce((m,f)=>Math.max(m,f.idx),0);
      const price = nextFloorPrice();
      const card=document.createElement('div'); 
      card.className='buy-floor-card';
      card.innerHTML=`<div class="price">Mở tầng ${maxIdx+1}: <b>${price}</b> coins</div><button class="do-buy-floor">Buy Floor</button>`;
      card.querySelector('.do-buy-floor').addEventListener('click',async()=>{
        if(!confirm(`Mở tầng ${maxIdx+1} với giá ${price} coins?`))return;
        try{await api('/floors/buy',{});await refresh();}catch(err){showError(err,'buy-floor');}
      });
      frag.appendChild(card);

      // Thanh điều hướng Previous / Next dưới các tầng
      const totalPages = getTotalFloorPagesFromState(s);
      const nav = document.createElement('div');
      nav.className = 'floor-nav';
      nav.innerHTML = `
        <button class="btn prev" ${floorPage===0?'disabled':''}>Previous floor</button>
        <div class="page-indicator">Page ${floorPage+1}/${totalPages}</div>
        <button class="btn next" ${floorPage>=totalPages-1?'disabled':''}>Next floor</button>
      `;
      nav.querySelector('.prev')?.addEventListener('click', ()=>{
        if (floorPage>0){ floorPage--; saveFloorPageToStorage(); renderState(state, {forceFloors:true}); }
      });
      nav.querySelector('.next')?.addEventListener('click', ()=>{
        if (floorPage<totalPages-1){ floorPage++; saveFloorPageToStorage(); renderState(state, {forceFloors:true}); }
      });
      frag.appendChild(nav);

      // Thay thế atomic để tránh blink
      floorsDiv.replaceChildren(frag);

      restoreFloorActionSelections();
      _lastFloorsSig = newSig;
    }
  }

  populateSelects();
  renderShop();
  renderBuyFloorPrice();
  renderMarketListings();
}

async function refresh(opts = {}){ const data = await get('/me/state'); renderState(data, opts); }

/* ---------- AUTH ---------- */
$('#btnLogin').addEventListener('click', async ()=>{
  const username=$('#username').value.trim(); if(!username) return alert('Enter username');
  await api('/auth/login',{username}); showApp(); await refresh(); connectWS();
});

/* ---------- TABS ---------- */
$$('.tabs button').forEach(b=>b.addEventListener('click', ()=> {
  setActive(b.dataset.tab);
  if (b.dataset.tab==='online') maybeLoadOnline();
}));

let _lastOnlineLoad = 0;
function maybeLoadOnline(){ const now = Date.now(); if (now - _lastOnlineLoad < 1500) return; _lastOnlineLoad = now; loadOnline(); }

/* ---------- SHOP SUBTABS ---------- */
$('#shop')?.addEventListener('click', (e)=>{
  const b = e.target.closest('#shopTabs button');
  if (!b) return;
  $('#shopTabs').querySelectorAll('button').forEach(x=>x.classList.toggle('active', x===b));
  ['shopSeeds','shopPots','shopTrap'].forEach(id=>{ $('#'+id).classList.toggle('hidden', b.dataset.sub !== id); });
});

/* ---------- SUBTABS INVENTORY ---------- */
$$('.subtabs button').forEach(b=>b.addEventListener('click', ()=>{
  $$('.subtabs button').forEach(x=>x.classList.toggle('active', x===b));
  $$('.subtab').forEach(sec=>sec.classList.add('hidden'));
  $('#'+b.dataset.sub).classList.remove('hidden');
}));

/* ---------- INVENTORY FILTER EVENTS + PLANT ALL ---------- */
$('#fltInvState')?.addEventListener('change', renderInventorySeeds);
$('#fltInvClass')?.addEventListener('change', renderInventorySeeds);
$('#fltInvMut')?.addEventListener('change', renderInventorySeeds);
$('#btnPlantAll')?.addEventListener('click', plantAllFiltered);

/* ---------- SHOP / TRAP ---------- */
$('#buyTrap')?.addEventListener('click', async ()=>{ try{ await api('/shop/buy-trap',{}); await refresh(); }catch(e){ showError(e,'buy-trap'); } });

/* ---------- SELL ---------- */
$('#btnSellShop')?.addEventListener('click', async ()=>{
  const id = parseInt($('#sellSeedSelect').value,10); if(!id) return;
  try{ const r = await api('/sell/shop',{ seedId:id }); alert('Paid '+r.paid); await refresh(); }catch(e){ showError(e, 'sell'); }
});

/* ---------- BREED ---------- */
$('#btnBreed')?.addEventListener('click', async ()=>{
  const a=parseInt($('#breedSelectA').value,10), b=parseInt($('#breedSelectB').value,10); if(!a||!b) return;
  if (a===b) return alert('Chọn 2 cây khác nhau');
  try{
    const r = await api('/breed',{ seedAId:a, seedBId:b });
    $('#breedOut').innerHTML =
      `${renderMutationBadge(r.mutation)} Out: <b>${r.outClass}</b> (base ${r.base})`;
    await refresh();
  }catch(e){ showError(e, 'breed'); }
});

// Random Breed
document.getElementById('btnRandomBreed')?.addEventListener('click', ()=>{
  const inv = (window.state?.seedInv || state?.seedInv || []).filter(s => s.is_mature === 1);
  const breedOut = document.getElementById('breedOut');
  const byClass = {};
  for (const s of inv) (byClass[s.class] ||= []).push(s);
  const classes = Object.keys(byClass);
  if (classes.length < 2) {
    if (breedOut) breedOut.textContent = 'Cần ít nhất 2 hạt mature thuộc 2 class khác nhau!';
    return;
  }
  const i = Math.floor(Math.random()*classes.length);
  let j = Math.floor(Math.random()*(classes.length-1));
  if (j >= i) j++;
  const c1 = classes[i], c2 = classes[j];
  const seed1 = byClass[c1][Math.floor(Math.random()*byClass[c1].length)];
  const seed2 = byClass[c2][Math.floor(Math.random()*byClass[c2].length)];
  const selA = document.getElementById('breedSelectA');
  const selB = document.getElementById('breedSelectB');
  if (selA && selB) {
    selA.value = String(seed1.id);
    selB.value = String(seed2.id);
    document.getElementById('btnBreed')?.click();
  }
});

/* ---------- MARKET ---------- */
$('#btnList')?.addEventListener('click', async ()=>{
  const id=parseInt($('#listSeedSelect').value,10);
  const price=parseInt($('#listPrice').value,10);
  if(!id||!price) return;
  try{
    await api('/market/list',{ seedId:id, askPrice:price });
    await refresh();
  }catch(e){ showError(e, 'market-list'); }
});
$('#marketList')?.addEventListener('click', async (e)=>{
  const b=e.target.closest('.buy-listing'); if(!b) return; 
  const id=parseInt(b.dataset.id,10);
  try{ await api('/market/buy',{ listingId:id }); await refresh(); }catch(e){ showError(e, 'market-buy'); }
});

/* ---------- FORM cũ ---------- */
$('#btnPlacePot')?.addEventListener('click', async ()=>{
  const floorId=parseInt($('#plantFloor').value,10);
  const slot=parseInt($('#plantSlot').value,10);
  const potId=parseInt($('#plantPot').value,10);
  if(!floorId||!slot||!potId) return;
  try{ await api('/plot/place-pot',{ floorId, slot, potId }); await refresh(); }catch(e){ showError(e, 'place-pot'); }
});
$('#btnPlant')?.addEventListener('click', async ()=>{
  const floorId=parseInt($('#plantFloor').value,10);
  const slot=parseInt($('#plantSlot').value,10);
  const seedId=parseInt($('#plantSeed').value,10);
  if(!floorId||!slot||!seedId) return;
  try{ await api('/plot/plant',{ floorId, slot, seedId }); await refresh(); }catch(e){ showError(e, 'plant'); }
});

/* ---------- ONLINE (Visit & Steal) ---------- */
async function loadOnline(){
  try{
    const r = await get('/online');
    const ul=$('#onlineList'); if (!ul) return;
    ul.innerHTML='';
    r.users.forEach(async (u)=>{
      const li=document.createElement('li');
      li.innerHTML = `<div class="row"><b>${u.username}</b> (#${u.id}) <select class="visit-floor" data-uid="${u.id}"></select> <button class="visit" data-uid="${u.id}">Visit</button></div><div class="visit-view" id="visit-${u.id}"></div>`;
      ul.appendChild(li);
      try{
        const f = await get('/visit/floors?userId='+u.id);
        const sel = li.querySelector('.visit-floor');
        preserveSelectValue(sel, ()=>{
          sel.innerHTML='';
          f.floors.forEach(fl=>{
            const o=document.createElement('option'); o.value=fl.id; o.textContent=`Floor ${fl.idx} (traps ${fl.trap_count})`; sel.appendChild(o);
          });
        });
        sel.addEventListener('change', ()=>{
          const view = li.querySelector('#visit-'+u.id);
          if (view) view.innerHTML='';
        });
      }catch(e){}
    });
  }catch(e){ console.log(e); }
}
function clearAllVisitViews(){ $$('.visit-view').forEach(v=>v.innerHTML=''); }

async function renderVisitedFloor(uid, floorId){
  const container = document.querySelector('#visit-'+uid);
  if (!container) return;
  container.innerHTML = '<div class="skeleton"></div>';

  try {
    const data = await get('/visit/floor?floorId='+floorId);
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'plots';

    data.plots.forEach(p=>{
      const el = buildPlotElement(p);
      // theo dõi viewport cho timer ở trang visit
      ensureObservers();
      timerVisObserver?.observe(el);
      wrap.appendChild(el);
    });

    container.appendChild(wrap);
  } catch(e) {
    console.log(e);
  }
}

$('#onlineList')?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.visit');
  if (!btn) return;
  const uid = parseInt(btn.dataset.uid, 10);
  const li  = btn.closest('li');
  const sel = li.querySelector('.visit-floor');
  const floorId = parseInt(sel?.value, 10);
  if (!floorId) return;

  clearAllVisitViews();
  await renderVisitedFloor(uid, floorId);
});

/* ---------- FLOOR NAV (cuộn trong trang đang hiển thị) ---------- */
function ensureFloorVisible(){
  const floors = $$('#floors .floor');
  if (floors.length===0) return;
  currentFloorIdx = Math.max(0, Math.min(currentFloorIdx, floors.length-1));
  floors[currentFloorIdx].scrollIntoView({behavior:'smooth', block:'center'});
}
$('#btnPrevFloor')?.addEventListener('click', ()=>{ currentFloorIdx = Math.max(0, currentFloorIdx-1); ensureFloorVisible(); });
$('#btnNextFloor')?.addEventListener('click', ()=>{ const n = $$('#floors .floor').length; currentFloorIdx = Math.min(n-1, currentFloorIdx+1); ensureFloorVisible(); });

/* ---------- HARVEST ALL ---------- */
async function harvestAllMature() {
  const btn = document.getElementById('btnHarvestAll');
  if (btn) btn.disabled = true;
  try {
    const r = await api('/plot/harvest-all', {});
    alert(`Đã thu hoạch ${r.harvested} plot mature`);
    await refresh();
  } catch (e) {
    showError(e, 'harvest-all');
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.getElementById('btnHarvestAll')?.addEventListener('click', harvestAllMature);

/* ---------- WS & timers ---------- */
let ws;
let _wsPendingPayload = null;
let _wsTimer = null;
function connectWS(){
  ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host);
  ws.onmessage = (ev)=>{
    try{
      const msg=JSON.parse(ev.data);
      if(msg.type==='state:update'){
        // Gộp nhiều event nhanh thành 1 lần render
        _wsPendingPayload = msg.payload;
        if (_wsTimer) return;
        _wsTimer = setTimeout(()=>{
          const payload = _wsPendingPayload;
          _wsPendingPayload = null;
          _wsTimer = null;
          renderState(payload, { soft:false, forceFloors:true }); // action => render mạnh tay
        }, 120);
      }
    }catch(e){}
  };
}
function fmtMs(ms){ if (ms<=0) return 'Mature'; const s=Math.ceil(ms/1000); const m=Math.floor(s/60); const r=s%60; return `${m}:${String(r).padStart(2,'0')}`; }

/** cập nhật timer cho 1 plot element */
function updatePlotTimer(el){
  const tVal = el.querySelector('.stat.time .value');
  if (!tVal) return;
  const st = el.dataset.stage;
  if (st === 'mature'){ tVal.textContent = 'Mature'; return; }
  const mAt = +el.dataset.matureAt || 0;
  const now = Date.now();
  tVal.textContent = mAt ? fmtMs(mAt - now) : '';
}

/** chỉ quét các plot đang trong viewport (đã theo dõi bằng IntersectionObserver) */
function tickTimers(){
  if (visibleTimerPlots.size === 0) return;
  for (const el of visibleTimerPlots){
    updatePlotTimer(el);
  }
}
setInterval(tickTimers, 1000);

/* ===== Auto Pot / Auto Plant ===== */
const Auto = {
  pot: false,
  plant: false,
  _busy: false,
  _timerId: null,
  filters: {
    useAllClasses: true,
    classes: {},
    pots: { timeskip:true, gold:true, basic:true }
  }
};
function autoSave(){
  try {
    localStorage.setItem('auto_settings', JSON.stringify({
      pot: Auto.pot,
      plant: Auto.plant,
      filters: Auto.filters
    }));
  } catch {}
}
function autoLoad(){
  try{
    const raw = localStorage.getItem('auto_settings');
    if(!raw) return;
    const obj = JSON.parse(raw);
    if (typeof obj.pot === 'boolean')   Auto.pot   = obj.pot;
    if (typeof obj.plant === 'boolean') Auto.plant = obj.plant;
    if (obj.filters){
      Auto.filters.useAllClasses = (obj.filters.useAllClasses !== undefined) ? !!obj.filters.useAllClasses : true;
      if (obj.filters.classes && typeof obj.filters.classes === 'object') {
        Auto.filters.classes = { ...obj.filters.classes };
      }
      if (obj.filters.pots && typeof obj.filters.pots === 'object') {
        Auto.filters.pots = { timeskip:true, gold:true, basic:true, ...obj.filters.pots };
      }
    }
  }catch{}
}
autoLoad();

function getAvailableClassesFromState(){
  const set = new Set();
  (state?.seedInv||[]).forEach(s=>{
    if (s && s.class) set.add(s.class);
  });
  return Array.from(set).sort();
}

function ensureFarmAutoControls(){
  const bar = document.getElementById('farmControls');
  if (!bar) return;

  let btnPot = bar.querySelector('.btnAutoPot');
  let btnPlant = bar.querySelector('.btnAutoPlant');

  if (!btnPot) {
    btnPot = document.createElement('button');
    btnPot.className = 'btnAutoPot';
    const syncBtnPot = ()=> {
      btnPot.classList.toggle('active', Auto.pot);
      btnPot.textContent = 'Auto Pot: ' + (Auto.pot ? 'ON' : 'OFF');
    };
    btnPot.addEventListener('click', ()=>{
      Auto.pot = !Auto.pot; syncBtnPot(); autoSave();
    });
    syncBtnPot();
    bar.appendChild(btnPot);
  } else {
    btnPot.classList.toggle('active', Auto.pot);
    btnPot.textContent = 'Auto Pot: ' + (Auto.pot ? 'ON' : 'OFF');
  }

  if (!btnPlant) {
    btnPlant = document.createElement('button');
    btnPlant.className = 'btnAutoPlant';
    const syncBtnPlant = ()=> {
      btnPlant.classList.toggle('active', Auto.plant);
      btnPlant.textContent = 'Auto Plant: ' + (Auto.plant ? 'ON' : 'OFF');
    };
    btnPlant.addEventListener('click', ()=>{
      Auto.plant = !Auto.plant; syncBtnPlant(); autoSave();
    });
    syncBtnPlant();
    bar.appendChild(btnPlant);
  } else {
    btnPlant.classList.toggle('active', Auto.plant);
    btnPlant.textContent = 'Auto Plant: ' + (Auto.plant ? 'ON' : 'OFF');
  }

  let box = bar.querySelector('.auto-filters');
  if (!box){
    box = document.createElement('div');
    box.className = 'auto-filters';
    bar.appendChild(box);
  }
  box.innerHTML = '';

  const clsGroup = document.createElement('div');
  clsGroup.className = 'filter-group';
  const clsLabel = document.createElement('span');
  clsLabel.className = 'label';
  clsLabel.textContent = 'Class:';
  clsGroup.appendChild(clsLabel);

  const allWrap = document.createElement('label');
  allWrap.className = 'chip';
  allWrap.title = 'Allow all classes';
  const allId = 'flt-cls-all';
  allWrap.innerHTML = `
    <input type="checkbox" id="${allId}" ${Auto.filters.useAllClasses ? 'checked':''}>
    <span>All</span>
  `;
  allWrap.querySelector('input').addEventListener('change', (e)=>{
    Auto.filters.useAllClasses = !!e.target.checked;
    autoSave();
    ensureFarmAutoControls();
  });
  clsGroup.appendChild(allWrap);

  const classes = getAvailableClassesFromState();
  classes.forEach(cls=>{
    if (!(cls in Auto.filters.classes)) Auto.filters.classes[cls] = true;

    const id = 'flt-cls-'+cls;
    const wrap = document.createElement('label');
    wrap.className = 'chip';
    wrap.title = `Allow ${cls}`;
    wrap.innerHTML = `
      <input type="checkbox" id="${id}" ${Auto.filters.classes[cls] ? 'checked':''} ${Auto.filters.useAllClasses ? 'disabled':''}>
      <span>${cls}</span>
    `;
    wrap.querySelector('input').addEventListener('change', (e)=>{
      Auto.filters.classes[cls] = !!e.target.checked;
      autoSave();
    });
    clsGroup.appendChild(wrap);
  });

  const potGroup = document.createElement('div');
  potGroup.className = 'filter-group';
  const potLabel = document.createElement('span');
  potLabel.className = 'label';
  potLabel.textContent = 'Pot:';
  potGroup.appendChild(potLabel);

  ['timeskip','gold','basic'].forEach(pt=>{
    const id = 'flt-pot-'+pt;
    const wrap = document.createElement('label');
    wrap.className = 'chip';
    wrap.title = `Allow ${pt}`;
    wrap.innerHTML = `
      <input type="checkbox" id="${id}" ${Auto.filters.pots[pt]?'checked':''}>
      <span>${pt}</span>
    `;
    wrap.querySelector('input').addEventListener('change', (e)=>{
      Auto.filters.pots[pt] = !!e.target.checked;
      autoSave();
    });
    potGroup.appendChild(wrap);
  });

  box.appendChild(clsGroup);
  box.appendChild(potGroup);
}

function findEmptyNoPotPlot() {
  if (!state) return null;
  for (const fp of state.plots) {
    for (const p of fp.plots) {
      if (!p.pot_id && (p.stage === 'empty' || !p.stage)) {
        return { floorId: fp.floor.id, slot: p.slot, floorIdx: fp.floor.idx };
      }
    }
  }
  return null;
}

function pickPotFromInv(){
  const inv = Array.isArray(state?.potInv) ? state.potInv.slice() : [];
  const order = { timeskip: 0, gold: 1, basic: 2 };
  const allowed = inv.filter(p => Auto.filters.pots[p.type]);
  allowed.sort((a,b)=> (order[a.type]??9) - (order[b.type]??9));
  return allowed[0] || null;
}

function findEmptyWithPotPlot(){
  if (!state) return null;
  for (const fp of state.plots) {
    for (const p of fp.plots) {
      if (p.pot_id && p.stage === 'empty') {
        return { floorId: fp.floor.id, slot: p.slot, floorIdx: fp.floor.idx };
      }
    }
  }
  return null;
}

function pickSeedForPlant(){
  const seeds = Array.isArray(state?.seedInv) ? state.seedInv : [];
  const pool = seeds.filter(s => s.is_mature === 0);
  if (Auto.filters.useAllClasses) return pool[0] || null;
  return pool.find(s => Auto.filters.classes[s.class] !== false) || null;
}

async function autoTickOnce(){
  if (Auto._busy || (!Auto.pot && !Auto.plant)) return;
  Auto._busy = true;

  try{
    if (Auto.pot){
      const target = findEmptyNoPotPlot();
      const pot = pickPotFromInv();
      if (target && pot){
        await api('/plot/place-pot', { floorId: target.floorId, slot: target.slot, potId: pot.id });
        await refresh();
        return;
      }
    }
    if (Auto.plant){
      const target = findEmptyWithPotPlot();
      const seed = pickSeedForPlant();
      if (target && seed){
        await api('/plot/plant', { floorId: target.floorId, slot: target.slot, seedId: seed.id });
        await refresh();
        return;
      }
    }
  } catch(e){
    showError(e, 'auto');
  } finally {
    Auto._busy = false;
  }
}

function startAutoLoop(){
  if (Auto._timerId) return;
  Auto._timerId = setInterval(autoTickOnce, 1200);
}

(function initAutoFeatures(){
  document.addEventListener('DOMContentLoaded', ()=>{
    ensureFarmAutoControls();
    startAutoLoop();
  });
})();

/* ---------- Phím tắt ← / → để chuyển trang tầng ---------- */
document.addEventListener('keydown', (e)=>{
  // bỏ qua khi gõ trong input/select/textarea
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag==='input' || tag==='select' || tag==='textarea' || e.altKey || e.ctrlKey || e.metaKey) return;
  const activeTab = Array.from($$('.tabs button')).find(b=>b.classList.contains('active'))?.dataset.tab;
  if (activeTab !== 'farm' && activeTab !== 'shop' && activeTab !== 'inventory') {
    // vẫn cho phép ở hầu hết tab chính liên quan farm
  }
  if (e.key === 'ArrowLeft'){
    const total = getTotalFloorPagesFromState(state||{plots:[]});
    if (floorPage > 0){ floorPage--; saveFloorPageToStorage(); renderState(state, {forceFloors:true}); }
    e.preventDefault();
  }
  if (e.key === 'ArrowRight'){
    const total = getTotalFloorPagesFromState(state||{plots:[]});
    if (floorPage < total - 1){ floorPage++; saveFloorPageToStorage(); renderState(state, {forceFloors:true}); }
    e.preventDefault();
  }
});

// Polling nhẹ (soft) mỗi 10s, bỏ qua khi đang ở tab online
setInterval(()=>{ if($('#tabs').classList.contains('hidden')) return;
  const active = Array.from($$('.tabs button')).find(b=>b.classList.contains('active'))?.dataset.tab;
  if (active === 'online') return;
  refresh({ soft: true }).catch(()=>{});
}, 10000);

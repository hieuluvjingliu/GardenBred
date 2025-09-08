const $ = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
let state = null;
let currentFloorIdx = 0;
let floorActionSel = {}; // { [floorId]: {slot, potId, seedId} }

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
  // lấy state hiện tại từ DOM trước khi render lại
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
  // đặt lại value nếu vẫn còn tồn tại trong options
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
function renderShop(){
  const seedGrid = $('#seedShopGrid'); if (!seedGrid) return;
  seedGrid.innerHTML='';
  ['fire','water','wind','earth'].forEach(cls=>{
    const el = document.createElement('div');
    el.className='item';
    const img = document.createElement('img');
    img.src = `/assets/Seed_Planted/seed_planted_${cls}.png`;
    img.onerror = ()=>{ img.replaceWith(Object.assign(document.createElement('div'),{textContent:cls.toUpperCase(),style:'height:72px;display:flex;align-items:center;justify-content:center'})); };
    const btn = document.createElement('button'); btn.textContent = `Buy ${cls} (100)`;
    btn.addEventListener('click', async ()=>{ try{ await api('/shop/buy',{ itemType:'seed', classOrType: cls, qty:1}); await refresh(); }catch(e){ showError(e,'buy-seed'); } });
    const lbl = document.createElement('span'); lbl.className='label'; lbl.textContent = cls;
    el.append(img, lbl, btn); seedGrid.appendChild(el);
  });

  const potGrid = $('#potShopGrid'); if (!potGrid) return; potGrid.innerHTML='';
  [{type:'basic', img:'pot1.png', label:'Basic (100)'},{type:'gold', img:'pot2.png', label:'Gold +50% (300)'},{type:'timeskip', img:'pot3.png', label:'Time Skip +50% (300)'}]
  .forEach(p=>{
    const el=document.createElement('div'); el.className='item';
    const img = document.createElement('img'); img.src = `/assets/Pots_Image/${p.img}`;
    img.onerror = ()=>{ img.replaceWith(Object.assign(document.createElement('div'),{textContent:p.type,style:'height:72px;display:flex;align-items:center;justify-content:center'})); };
    const btn = document.createElement('button'); btn.textContent = p.label;
    btn.addEventListener('click', async ()=>{ try{ await api('/shop/buy',{ itemType:'pot', classOrType:p.type, qty:1}); await refresh(); }catch(e){ showError(e,'buy-pot'); } });
    const lbl = document.createElement('span'); lbl.className='label'; lbl.textContent = p.type;
    el.append(img,lbl,btn); potGrid.appendChild(el);
  });
}

/* ---------- MARKET: render danh sách từ state.market ---------- */
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

function populateSelects(){
  if (!state) return;

  // Sell (mature only)
  const sellSel = $('#sellSeedSelect');
  if (sellSel){
    preserveSelectValue(sellSel, ()=>{
      sellSel.innerHTML = '';
      state.seedInv.filter(s=>s.is_mature===1).forEach(s=>{
        const o = document.createElement('option');
        o.value = s.id; o.textContent = `#${s.id} ${s.class}`;
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
        o.value = s.id; o.textContent = `#${s.id} ${s.class}`;
        listSel.appendChild(o);
      });
    });
  }

  // Mature by class
  const matUl = $('#matureByClass'); 
  if (matUl){
    matUl.innerHTML='';
    const by = groupMatureByClass();
    Object.keys(by).sort().forEach(cls=>{
      const li = document.createElement('li');
      li.dataset.mature = "1";   // highlight bằng CSS
      li.textContent = `${cls}: ${by[cls]}`;
      matUl.appendChild(li);
    });
  }

  // Breed selects (mature only)
  const selA = $('#breedSelectA'), selB = $('#breedSelectB');
  if (selA && selB){
    const oldA = selA.value, oldB = selB.value;
    selA.innerHTML=''; selB.innerHTML='';
    state.seedInv.filter(s=>s.is_mature===1).forEach(s=>{
      const oa=document.createElement('option'); oa.value=s.id; oa.textContent=`#${s.id} ${s.class}`; selA.appendChild(oa);
      const ob=document.createElement('option'); ob.value=s.id; ob.textContent=`#${s.id} ${s.class}`; selB.appendChild(ob);
    });
    if (Array.from(selA.options).some(o=>o.value===oldA)) selA.value = oldA;
    if (Array.from(selB.options).some(o=>o.value===oldB)) selB.value = oldB;
  }

  // Form cũ ở đáy (giữ để không lỗi nếu còn trong HTML)
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
      seedSel.innerHTML=''; state.seedInv.filter(s=>s.is_mature===0).forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=`#${s.id} ${s.class}`; seedSel.appendChild(o); });
    });
  }
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

/* ---------- RENDER STATE ---------- */
function renderState(s){
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
    snapshotFloorActionSelections(); 
    floorsDiv.innerHTML='';

    s.plots.forEach(fp=>{
      const f=document.createElement('div'); 
      f.className='floor'; 
      f.dataset.floorId=fp.floor.id;
      f.innerHTML=`<h3>Floor ${fp.floor.idx}</h3>`;

      const wrap=document.createElement('div'); 
      wrap.className='plots';

      fp.plots.forEach(p=>{
        const el=document.createElement('div');
        el.className='plot'; 
        el.dataset.plotId=p.id; 
        el.dataset.stage=p.stage||'empty'; 
        el.dataset.class=p.class||''; // để CSS theme theo hệ
        if(p.mature_at) el.dataset.matureAt=p.mature_at;

        const stats=document.createElement('div'); 
        stats.className='stats';
        stats.innerHTML=`<div class="stat cls"><div class="label">Class</div><div class="value">${p.class||'empty'}</div></div>
                         <div class="stat time"><div class="label">Time left</div><div class="value"></div></div>`;

        const visual=document.createElement('div'); 
        visual.className='visual';
        if(p.pot_type){ 
          const pot=document.createElement('img'); 
          pot.className='pot';
          pot.src=`/assets/Pots_Image/${p.pot_type==='gold'?'pot2.png':(p.pot_type==='timeskip'?'pot3.png':'pot1.png')}`;
          visual.appendChild(pot);
        }
        if(p.class&&p.stage){ 
          const folder=p.stage==='planted'?'Seed_Planted':p.stage==='growing'?'Seed_Growing':'Seed_Mature';
          const plant=document.createElement('img'); 
          plant.className='plant';
          plant.src=`/assets/${folder}/seed_${p.stage}_${p.class}.png`; 
          visual.appendChild(plant);
        }

        el.append(stats,visual); 
        if(p.stage==='mature') el.classList.add('mature'); 
        wrap.appendChild(el);
      });

      f.appendChild(wrap);

      // Action bar mỗi tầng
      const act=document.createElement('div'); 
      act.className='floor-actions';
      act.innerHTML=`<span class="floor-tag">Floor ${fp.floor.idx}</span>
        <select class="sel-slot">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>
        <select class="sel-pot">${(s.potInv||[]).map(p=>`<option value="${p.id}">#${p.id} ${p.type}</option>`).join('')}</select>
        <select class="sel-seed">${(s.seedInv||[]).filter(x=>!x.is_mature).map(x=>`<option value="${x.id}">#${x.id} ${x.class}</option>`).join('')}</select>
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

      floorsDiv.appendChild(f);
    });

    // Buy floor ở cuối
    const maxIdx = (s.floors||[]).reduce((m,f)=>Math.max(m,f.idx),0);
    const price = nextFloorPrice();
    const card=document.createElement('div'); 
    card.className='buy-floor-card';
    card.innerHTML=`<div class="price">Mở tầng ${maxIdx+1}: <b>${price}</b> coins</div><button class="do-buy-floor">Buy Floor</button>`;
    floorsDiv.appendChild(card);
    card.querySelector('.do-buy-floor').addEventListener('click',async()=>{
      if(!confirm(`Mở tầng ${maxIdx+1} với giá ${price} coins?`))return;
      try{await api('/floors/buy',{});await refresh();}catch(err){showError(err,'buy-floor');}
    });

    restoreFloorActionSelections();
  }

  populateSelects();
  renderShop();
  renderBuyFloorPrice();
  renderMarketListings();   // <<< vẽ danh sách chợ trời
}

async function refresh(){ const data = await get('/me/state'); renderState(data); }

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
  try{ const r = await api('/breed',{ seedAId:a, seedBId:b }); $('#breedOut').textContent = `Out: ${r.outClass} (base ${r.base})`; await refresh(); }catch(e){ showError(e, 'breed'); }
});

/* ---------- MARKET ---------- */
$('#btnList')?.addEventListener('click', async ()=>{
  const id=parseInt($('#listSeedSelect').value,10);
  const price=parseInt($('#listPrice').value,10);
  if(!id||!price) return;
  try{
    await api('/market/list',{ seedId:id, askPrice:price });
    await refresh(); // /me/state -> state.market mới -> renderMarketListings()
  }catch(e){ showError(e, 'market-list'); }
});
$('#marketList')?.addEventListener('click', async (e)=>{
  const b=e.target.closest('.buy-listing'); if(!b) return; 
  const id=parseInt(b.dataset.id,10);
  try{ await api('/market/buy',{ listingId:id }); await refresh(); }catch(e){ showError(e, 'market-buy'); }
});

/* ---------- FORM cũ ở đáy (nếu còn) ---------- */
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

  // SKELETON
  container.innerHTML = '<div class="skeleton"></div>';

  try {
    const data = await get('/visit/floor?floorId='+floorId);
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'plots';

    data.plots.forEach(p=>{
      const el = document.createElement('div');
      el.className = 'plot';
      el.dataset.plotId = p.id;
      el.dataset.stage  = p.stage || 'empty';
      el.dataset.class  = p.class  || '';
      if (p.mature_at) el.dataset.matureAt = p.mature_at;

      const stats = document.createElement('div');
      stats.className = 'stats';

      const statClass = document.createElement('div');
      statClass.className = 'stat cls';
      statClass.innerHTML = `<div class="label">Class</div><div class="value">${p.class || 'empty'}</div>`;
      stats.appendChild(statClass);

      const statTime = document.createElement('div');
      statTime.className = 'stat time';
      statTime.innerHTML = `<div class="label">Time left</div><div class="value"></div>`;
      stats.appendChild(statTime);

      const visual = document.createElement('div');
      visual.className = 'visual';

      if (p.pot_type){
        const potImg = document.createElement('img');
        potImg.className = 'pot';
        potImg.src = `/assets/Pots_Image/${p.pot_type==='gold'?'pot2.png':(p.pot_type==='timeskip'?'pot3.png':'pot1.png')}`;
        visual.appendChild(potImg);
      }

      if (p.class && p.stage){
        const stageFolder = p.stage==='planted' ? 'Seed_Planted'
                         : p.stage==='growing' ? 'Seed_Growing'
                         : p.stage==='mature'  ? 'Seed_Mature' : null;
        if (stageFolder){
          const plantImg = document.createElement('img');
          plantImg.className = 'plant';
          plantImg.src = `/assets/${stageFolder}/seed_${p.stage}_${p.class}.png`;
          visual.appendChild(plantImg);
        }
      }

      el.append(stats, visual);
      if (p.stage==='mature') {
        el.classList.add('mature');
        el.title = 'Click để ăn trộm';
      }

      el.addEventListener('click', async ()=>{
        if (p.stage!=='mature') return;
        try{
          const r = await api('/visit/steal-plot', {
            targetUserId: data.floor.user_id,
            floorId: data.floor.id,
            plotId: p.id
          });
          if (r.trap) alert('Trap! penalty ' + r.penalty);
          else if (r.ok) alert('Stolen seed class ' + r.class);
          else alert(r.reason || 'fail');
          await refresh();
          await renderVisitedFloor(uid, data.floor.id);
        }catch(err){ showError(err,'visit-steal'); }
      });

      wrap.appendChild(el);
    });

    container.appendChild(wrap);
  } catch(e) {
    console.log(e);
  }
}

// Click nút Visit trong danh sách Online
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

/* ---------- FLOOR NAV ---------- */
function ensureFloorVisible(){
  const floors = $$('#floors .floor');
  if (floors.length===0) return;
  currentFloorIdx = Math.max(0, Math.min(currentFloorIdx, floors.length-1));
  floors[currentFloorIdx].scrollIntoView({behavior:'smooth', block:'center'});
}
$('#btnPrevFloor')?.addEventListener('click', ()=>{ currentFloorIdx = Math.max(0, currentFloorIdx-1); ensureFloorVisible(); });
$('#btnNextFloor')?.addEventListener('click', ()=>{ const n = $$('#floors .floor').length; currentFloorIdx = Math.min(n-1, currentFloorIdx+1); ensureFloorVisible(); });

/* ---------- WS & timers ---------- */
let ws;
function connectWS(){
  ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host);
  ws.onmessage = (ev)=>{ try{ const msg=JSON.parse(ev.data); if(msg.type==='state:update'){ renderState(msg.payload); } }catch(e){} };
}
function fmtMs(ms){ if (ms<=0) return 'Mature'; const s=Math.ceil(ms/1000); const m=Math.floor(s/60); const r=s%60; return `${m}:${String(r).padStart(2,'0')}`; }

function tickTimers(){
  const now = Date.now();
  $$('.plot').forEach(el=>{
    const tVal = el.querySelector('.stat.time .value');
    if (!tVal) return;
    const st = el.dataset.stage;
    if (st === 'mature'){ tVal.textContent = 'Mature'; return; }
    const mAt = +el.dataset.matureAt || 0;
    tVal.textContent = mAt ? fmtMs(mAt - now) : '';
  });
}
setInterval(tickTimers, 1000);

/* ===== Auto Pot / Auto Plant (+ Dynamic Class Filter) ===== */
const Auto = {
  pot: false,
  plant: false,
  _busy: false,      // khóa tránh spam request
  _timerId: null,
  filters: {
    useAllClasses: true,                   // BẬT để trồng mọi class
    classes: { /* dynamic: 'fire':true, ... */ },
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

// Tạo nút toggle + bộ lọc checkbox trong khu Farm Controls (render lại mỗi lần để sync động)
function ensureFarmAutoControls(){
  const bar = document.getElementById('farmControls');
  if (!bar) return;

  // Toggle buttons (tạo một lần, sau đó chỉ sync)
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

  // ---- Filters container (rebuild mỗi lần để sync class động)
  let box = bar.querySelector('.auto-filters');
  if (!box){
    box = document.createElement('div');
    box.className = 'auto-filters';
    bar.appendChild(box);
  }
  box.innerHTML = '';

  // --- Class filter group (All + dynamic classes)
  const clsGroup = document.createElement('div');
  clsGroup.className = 'filter-group';
  const clsLabel = document.createElement('span');
  clsLabel.className = 'label';
  clsLabel.textContent = 'Class:';
  clsGroup.appendChild(clsLabel);

  // All classes master checkbox
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
    ensureFarmAutoControls(); // re-render để enable/disable các checkbox class
  });
  clsGroup.appendChild(allWrap);

  // Dynamic classes from current inventory
  const classes = getAvailableClassesFromState();
  classes.forEach(cls=>{
    if (!(cls in Auto.filters.classes)) Auto.filters.classes[cls] = true; // mặc định bật

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

  // --- Pot filter group
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

// Tìm một ô trống chưa có pot
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

// Lấy 1 pot từ inventory theo filter (ưu tiên timeskip -> gold -> basic)
function pickPotFromInv(){
  const inv = Array.isArray(state?.potInv) ? state.potInv.slice() : [];
  const order = { timeskip: 0, gold: 1, basic: 2 };
  const allowed = inv.filter(p => Auto.filters.pots[p.type]);
  allowed.sort((a,b)=> (order[a.type]??9) - (order[b.type]??9));
  return allowed[0] || null;
}

// Tìm ô đã có pot nhưng đang trống để trồng
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

// Lấy 1 seed chưa mature theo filter class (All hoặc theo từng class)
function pickSeedForPlant(){
  const seeds = Array.isArray(state?.seedInv) ? state.seedInv : [];
  const pool = seeds.filter(s => s.is_mature === 0);

  if (Auto.filters.useAllClasses) return pool[0] || null;

  return pool.find(s => Auto.filters.classes[s.class] !== false) || null;
}

// Thực hiện 1 hành động / tick (đặt pot trước, rồi mới trồng)
async function autoTickOnce(){
  if (Auto._busy || (!Auto.pot && !Auto.plant)) return;
  Auto._busy = true;

  try{
    // 1) Auto Pot
    if (Auto.pot){
      const target = findEmptyNoPotPlot();
      const pot = pickPotFromInv();
      if (target && pot){
        await api('/plot/place-pot', { floorId: target.floorId, slot: target.slot, potId: pot.id });
        await refresh();
        return; // làm 1 việc/tick
      }
    }

    // 2) Auto Plant
    if (Auto.plant){
      const target = findEmptyWithPotPlot();
      const seed = pickSeedForPlant();
      if (target && seed){
        await api('/plot/plant', { floorId: target.floorId, slot: target.slot, seedId: seed.id });
        await refresh();
        return; // làm 1 việc/tick
      }
    }
  } catch(e){
    showError(e, 'auto');
  } finally {
    Auto._busy = false;
  }
}

// Khởi động vòng lặp nhẹ nhàng, mỗi 1.2s thử 1 action
function startAutoLoop(){
  if (Auto._timerId) return;
  Auto._timerId = setInterval(autoTickOnce, 1200);
}

// Gọi khi app vào được và mỗi lần render state để chắc UI có sẵn
(function initAutoFeatures(){
  document.addEventListener('DOMContentLoaded', ()=>{
    ensureFarmAutoControls();
    startAutoLoop();
  });
})();

// auto-refresh (trừ khi đang ở Online)
setInterval(()=>{ if($('#tabs').classList.contains('hidden')) return;
  const active = Array.from($$('.tabs button')).find(b=>b.classList.contains('active'))?.dataset.tab;
  if (active === 'online') return;
  refresh().catch(()=>{});
}, 10000);

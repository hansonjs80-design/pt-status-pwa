// A seven-segment clock that occupies only the visible spacer column.
(() => {
  const storageKey = 'PT_SHEET_CLOCK_V1';
  let state = { enabled: true, updatedAt: 0 }, changed = false, store;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (typeof saved?.enabled === 'boolean' && Number.isFinite(saved.updatedAt)) state = saved;
  } catch (_) {}
  const persistLocal = () => { try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch (_) {} };
  const notify = () => window.dispatchEvent(new Event('pt-clock-setting-changed'));
  window.ptSheetClock = {
    get enabled() { return state.enabled; },
    async setEnabled(enabled) {
      changed = true;
      state = { enabled: Boolean(enabled), updatedAt: Math.max(Date.now(),state.updatedAt+1) };
      persistLocal(); notify();
      if (store) await store('device-sheet-clock-v1',state);
    },
    async restore(deviceStore) {
      store = deviceStore;
      const saved = await store('device-sheet-clock-v1');
      if (!changed && typeof saved?.enabled === 'boolean' && Number.isFinite(saved.updatedAt) && saved.updatedAt >= state.updatedAt) {
        state = saved; persistLocal(); notify();
      } else await store('device-sheet-clock-v1',state);
    },
  };
  const digits = ['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
  const shapes = {
    a:'6,5 12,0 38,0 44,5 38,10 12,10',
    b:'45,7 50,12 50,43 45,48 40,43 40,12',
    c:'45,52 50,57 50,88 45,93 40,88 40,57',
    d:'6,95 12,90 38,90 44,95 38,100 12,100',
    e:'5,52 10,57 10,88 5,93 0,88 0,57',
    f:'5,7 10,12 10,43 5,48 0,43 0,12',
    g:'6,50 12,45 38,45 44,50 38,55 12,55',
  };
  function createClock() {
    const sheet = document.getElementById('sheetContainer');
    if (!sheet) return;
    const clock = document.createElement('div');
    clock.id = 'sheetDigitalClock';
    clock.className = 'sheet-digital-clock';
    clock.setAttribute('role','img');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 366 100');
    svg.setAttribute('preserveAspectRatio','none');
    svg.setAttribute('aria-hidden','true');
    const segments = [0,56,130,186,260,316].map(x => {
      const group = document.createElementNS(ns,'g');
      group.setAttribute('transform',`translate(${x} 0)`);
      svg.append(group);
      return Object.entries(shapes).map(([name,points]) => {
        const polygon = document.createElementNS(ns,'polygon');
        polygon.setAttribute('points',points); group.append(polygon);
        return { name, polygon };
      });
    });
    for (const x of [116,246]) for (const y of [30,66]) {
      const dot = document.createElementNS(ns,'rect');
      for (const [key,value] of Object.entries({x,y,width:8,height:8})) dot.setAttribute(key,value);
      svg.append(dot);
    }
    clock.append(svg); document.body.append(clock);
    let pending = false;
    const position = () => {
      pending = false;
      if (!state.enabled) { clock.hidden = true; return; }
      const spacer = document.querySelector('.col-headers-row .col-spacer');
      if (!spacer) { clock.hidden = true; return; }
      const bounds = sheet.getBoundingClientRect(), blank = spacer.getBoundingClientRect();
      const viewport = window.visualViewport;
      const right = Math.min(bounds.left + sheet.clientWidth, viewport ? viewport.offsetLeft + viewport.width : window.innerWidth) - 12;
      const left = Math.max(blank.left, bounds.left) + 12;
      const header = document.querySelector('.business-headers-row')?.getBoundingClientRect();
      const top = Math.max(bounds.top,header?.bottom || bounds.top) + 10;
      let bottom = Math.min(bounds.top + sheet.clientHeight, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 12;
      let height = Math.min(120, Math.max(0,right-left) / 3.66, bottom-top);
      // Search year labels belong to the table and always take priority.
      const labels = [...sheet.querySelectorAll('.history-year-cell')].filter(el => el.textContent.trim()).map(el => el.getBoundingClientRect())
        .filter(r => r.width && r.bottom > top && r.top < bottom).sort((a,b)=>b.top-a.top);
      for (const rect of labels) {
        if (rect.right > right-height*3.66 && rect.left < right && rect.bottom > bottom-height && rect.top < bottom) {
          bottom = rect.top - 10;
          height = Math.min(height,bottom-top);
        }
      }
      clock.hidden = height < 24;
      if (clock.hidden) return;
      Object.assign(clock.style,{left:`${right-height*3.66}px`,top:`${bottom-height*0.85}px`,width:`${height*3.66}px`,height:`${height*0.85}px`});
    };
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(position); } };
    const tick = () => {
      if (!state.enabled) { clock.hidden = true; return; }
      if (document.visibilityState === 'hidden') return;
      const now = new Date();
      const parts = [now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0'));
      parts.join('').split('').forEach((value,index)=>segments[index].forEach(({name,polygon})=>{
        polygon.classList.toggle('is-off', !digits[Number(value)].includes(name));
      }));
      clock.setAttribute('aria-label',`현재 시간 ${parts.join(':')}`);
      schedule();
    };
    new ResizeObserver(schedule).observe(sheet);
    new MutationObserver(schedule).observe(sheet,{childList:true,subtree:true});
    sheet.addEventListener('scroll',schedule,true);
    window.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    document.addEventListener('visibilitychange',tick);
    window.addEventListener('pt-clock-setting-changed',tick);
    tick(); setInterval(tick,1000);
  }
  window.addEventListener('DOMContentLoaded',createClock);
})();

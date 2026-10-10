// A seven-segment clock that occupies only the visible spacer column.
(() => {
  const digits = ['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
  const shapes = {
    a:'5,0 45,0 37,8 13,8', b:'46,2 46,46 38,38 38,10',
    c:'46,54 46,98 38,90 38,62', d:'5,100 45,100 37,92 13,92',
    e:'4,54 12,62 12,90 4,98', f:'4,2 12,10 12,38 4,46',
    g:'5,50 13,46 37,46 45,50 37,54 13,54',
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
      Object.assign(clock.style,{left:`${right-height*3.66}px`,top:`${bottom-height}px`,width:`${height*3.66}px`,height:`${height}px`});
    };
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(position); } };
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      const now = new Date();
      const parts = [now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0'));
      parts.join('').split('').forEach((value,index)=>segments[index].forEach(({name,polygon})=>{
        polygon.style.display = digits[Number(value)].includes(name) ? '' : 'none';
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
    tick(); setInterval(tick,1000);
  }
  window.addEventListener('DOMContentLoaded',createClock);
})();

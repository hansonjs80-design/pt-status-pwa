// In-cell completion is a visual overlay; candidate text never enters the native input.
class PTCellInputTools {
  handleEmptyCellEnter(event, armedInput = null) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !this.activeCell) return false;
    const { rowIdx, colKey } = this.activeCell;
    if (String(this.getCurrentRows()[rowIdx]?.[colKey] ?? '').trim()) return false;
    event.preventDefault(); event.stopPropagation();
    armedInput?.remove();
    this.selectAutocompleteRightCell(rowIdx, colKey);
    this.elSheetContainer?.focus({preventScroll:true});
    return true;
  }

  selectAutocompleteLeftCell(rowIdx, colKey) {
    this.selectAutocompleteAdjacentCell(rowIdx, colKey, -1);
  }

  selectAutocompleteRightCell(rowIdx, colKey) {
    this.selectAutocompleteAdjacentCell(rowIdx, colKey, 1);
  }

  selectAutocompleteAdjacentCell(rowIdx, colKey, direction) {
    const columns = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const index = columns.indexOf(colKey);
    if (index < 0) return;
    const targetKey = columns[Math.max(0, Math.min(columns.length - 1, index + direction))];
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${targetKey}"]`);
    if (cell) this.selectCell(rowIdx, targetKey, cell, false);
  }

  consumePresetLeftRepeat(event) {
    if (!this.presetLeftKeyHeld || !(event.key === 'ArrowLeft' || event.code === 'ArrowLeft') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    event.preventDefault(); event.stopPropagation(); return true;
  }

  getInlineCompletionSuffix(query, candidate) {
    if (!query || !candidate || query === candidate) return '';
    const split = text => Array.from(text, char => {
      const code = char.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return char;
      const initial = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(code / 588)];
      const vowel = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[Math.floor(code % 588 / 28)];
      const final = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][code % 28];
      const compounds = {'ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ'};
      return initial + vowel + (compounds[final] || final);
    });
    if (candidate.toLowerCase().startsWith(query.toLowerCase())) return candidate.slice(query.length);
    const parts = split(candidate), entered = split(query).join('');
    const full = parts.join('');
    let consumed = entered.length;
    if (!full.toLowerCase().startsWith(entered.toLowerCase())) {
      if (!this.matchesHangulPrefix(candidate, query, true) || !/[ㄱ-ㅎ]$/.test(query)) return '';
      consumed = parts.slice(0, query.length - 1).join('').length + 1;
    }
    let offset = 0;
    for (let index = 0; index < parts.length; index++) {
      if (offset + parts[index].length > consumed) {
        return this.assembleHangul(parts[index].slice(consumed - offset)) + candidate.slice(index + 1);
      }
      offset += parts[index].length;
      if (offset === consumed) return candidate.slice(index + 1);
    }
    return '';
  }

  clearInlineAutocompletePreview() {
    this.inlineAutocompletePreview?.remove();
    this.inlineAutocompletePreview = null;
    this.inlineAutocompleteInput?.classList.remove('has-inline-completion');
    this.inlineAutocompleteInput = null;
  }

  getInlineCompletionParts(query, candidate) {
    if (!this.getInlineCompletionSuffix(query, candidate)) return null;
    // Render complete candidate syllables instead of separated compatibility jamo.
    // Native editing still receives the original query (e.g. ㅇ or 잋).
    const prefixLength = Math.min(query.length, candidate.length);
    return { prefix: candidate.slice(0, prefixLength), suffix: candidate.slice(prefixLength) };
  }

  getCompletionJamo(char) {
    const code = char.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return [char];
    const initial = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(code / 588)];
    const vowel = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[Math.floor(code % 588 / 28)];
    const final = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][code % 28];
    const split = {'ㅘ':'ㅗㅏ','ㅙ':'ㅗㅐ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅔ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ',
      'ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ'};
    return [initial, ...Array.from(split[vowel] || vowel), ...Array.from(split[final] || final)];
  }

  getInlineCompletionComponents(query, candidate) {
    if (!query || !candidate || query === candidate) return null;
    // A compact Korean query previews compact syllables even when the saved
    // candidate contains spaces; the popup and committed value keep its wording.
    const displayCandidate = /[가-힣ㄱ-ㅎ]/.test(query) && !/\s/.test(query)
      ? candidate.replace(/\s+/g, "") : candidate;
    const blocks = Array.from(displayCandidate, char => ({char, jamo: this.getCompletionJamo(char), typed: 0}));
    // Keep every typed syllable visible in its original position.
    // Space-insensitive or pending-initial matches belong in the popup
    // when the candidate cannot extend the exact typed glyphs.
    const typedChars = Array.from(query);
    if (typedChars.some((char, index) => {
      const block = blocks[index];
      if (!block) return true;
      const code = char.charCodeAt(0) - 0xac00;
      if (code >= 0 && code <= 11171) return !block.jamo.join('').startsWith(this.getCompletionJamo(char).join(''));
      if (/^[ㄱ-ㅎ]$/.test(char)) return this.getChosung(block.char) !== char;
      return block.char.toLowerCase() !== char.toLowerCase();
    })) return null;
    const entered = typedChars.flatMap(char => this.getCompletionJamo(char)).join('');
    if (blocks.flatMap(block => block.jamo).join('').toLowerCase().startsWith(entered.toLowerCase())) {
      let remaining = entered.length;
      for (const block of blocks) { block.typed = Math.min(remaining, block.jamo.length); remaining -= block.typed; }
    } else if (this.matchesHangulPrefix(candidate, query, true)) {
      Array.from(query).forEach((char, index) => { if (blocks[index]) blocks[index].typed = this.getCompletionJamo(char).length; });
    } else return null;
    return blocks;
  }

  getCompletionTextLayout(font, metrics) {
    const size = parseFloat(font.fontSize);
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? size;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? size * .25;
    const height = Math.max(size * 1.35, ascent + descent + 2);
    return { height, baseline: (height - ascent - descent) / 2 + ascent };
  }

  createPartialHangulPreview(block, font) {
    // Every preview glyph uses the same font baseline, including full black
    // and gray syllables. Never center individual ink bounds across fonts.
    const scale = 6;
    this.completionGlyphCache ||= new Map();
    const key = `${font.font}|${block.char}|${block.typed}`;
    let cached = this.completionGlyphCache.get(key);
    if (!cached) {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      ctx.font = font.font;
      const width = ctx.measureText(block.char).width;
      const { height, baseline } = this.getCompletionTextLayout(font, ctx.measureText('한Ag'));
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
      ctx.scale(scale, scale); ctx.font = font.font; ctx.fillStyle = block.typed === block.jamo.length ? '#111' : '#92979e';
      ctx.fillText(block.char, 0, baseline);
      if (block.typed > 0 && block.typed < block.jamo.length && /[가-힣]/.test(block.char)) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
      let x0 = canvas.width, x1 = 0, y0 = canvas.height, y1 = 0;
      for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(data[(y*canvas.width+x)*4+3]>30) {
        x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
      }
      const code = block.char.charCodeAt(0)-0xac00;
      const vowel = Math.floor(code%588/28), hasFinal = code%28!==0;
      const vertical = [0,1,2,3,4,5,6,7,20].includes(vowel);
      const mixed = [9,10,11,14,15,16,19].includes(vowel);
      const gap = (axis, fraction, from=0, to=1, min=.3, max=.75) => {
        const low=axis==='x'?x0:y0, high=axis==='x'?x1:y1;
        const start=Math.round(low+(high-low)*min), end=Math.round(low+(high-low)*max);
        let best=Math.round(low+(high-low)*fraction), score=Infinity;
        for(let p=start;p<=end;p++) {
          let ink=0;
          const a=axis==='x'?y0:x0,b=axis==='x'?y1:x1;
          for(let other=Math.round(a+(b-a)*from);other<=a+(b-a)*to;other++) {
            const x=axis==='x'?p:other,y=axis==='x'?other:p;
            ink+=data[(y*canvas.width+x)*4+3];
          }
          const rank=ink+Math.abs((p-low)/(high-low)-fraction)*30;
          if(rank<score){score=rank;best=p;}
        }
        return best;
      };
      const finalY=hasFinal?gap('y',.7,0,1,.56,.8):y1+1;
      const upperRatio=(finalY-y0)/(y1-y0);
      const divideX=gap('x',mixed?.55:.5,0,upperRatio,.35,.7);
      const vowelY=gap('y',hasFinal?.35:.5,0,mixed?.65:1,.2,hasFinal?.5:.65);
      const finalX=gap('x',.5,(finalY-y0)/(y1-y0),1,.35,.65);
      const vowelUnits=mixed?2:1;
      const finalUnits=block.jamo.length-1-vowelUnits;
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
        const offset=(y*canvas.width+x)*4;
        if(!data[offset+3]) continue;
        let component;
        if(y>=finalY) component=1+vowelUnits+(finalUnits>1&&x>=finalX?1:0);
        else if(vertical) component=x<divideX?0:1;
        else if(mixed) component=x<divideX&&y<vowelY?0:x>=divideX?2:1;
        else component=y<vowelY?0:1;
        if(component<block.typed){data[offset]=17;data[offset+1]=17;data[offset+2]=17;}
      }
      ctx.putImageData(pixels,0,0);
      }
      cached={canvas,width,height};
      if(this.completionGlyphCache.size>=128) this.completionGlyphCache.delete(this.completionGlyphCache.keys().next().value);
      this.completionGlyphCache.set(key,cached);
    }
    const glyph = document.createElement('span'); glyph.className='inline-completion-glyph';
    const canvas = document.createElement('canvas'); canvas.width=cached.canvas.width;canvas.height=cached.canvas.height;
    canvas.getContext('2d').drawImage(cached.canvas,0,0);
    canvas.style.width=`${cached.width}px`;canvas.style.height=`${cached.height}px`;
    const text=document.createElement('span');text.className='inline-completion-glyph-text';text.textContent=block.char;
    glyph.append(canvas,text);return glyph;
  }

  normalizeCompletedHangulInput(input) {
    if (input.dataset.nativeComposing === 'true') return false;
    const value = input.value;
    const assembled = this.assembleHangul(value.normalize('NFC'));
    if (assembled === value) return false;
    const start = input.selectionStart, end = input.selectionEnd;
    const direction = input.selectionDirection;
    input.value = assembled;
    if (start !== null && end !== null) {
      input.setSelectionRange(this.assembleHangul(value.slice(0, start).normalize('NFC')).length,
        this.assembleHangul(value.slice(0, end).normalize('NFC')).length, direction);
    }
    return true;
  }

  updateInlineAutocompletePreview() {
    this.clearInlineAutocompletePreview();
    const state = this.autocompleteState;
    if (!state || !['name', 'chartNo', 'part', 'prescription', 'extra', 'memo', 'specialNote'].includes(state.colKey)) return;
    const { input, cellElement } = state;
    if (input.dataset?.nativeComposing === 'true' || !input.isConnected || document.activeElement !== input || !input.value ||
        input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
    const blocks = this.getInlineCompletionComponents(input.value, this.getSelectedAutocompleteItem());
    if (!blocks) return;
    const preview = document.createElement('span');
    preview.className = 'inline-autocomplete-preview'; preview.setAttribute('aria-hidden', 'true');
    const font = getComputedStyle(input);
    preview.style.font = font.font;
    preview.style.letterSpacing = font.letterSpacing;
    for (const block of blocks) preview.append(this.createPartialHangulPreview(block, font));
    input.classList.add('has-inline-completion');
    const paddingLeft = parseFloat(font.paddingLeft) || 0;
    preview.style.left = `${input.offsetLeft + paddingLeft - input.scrollLeft}px`;
    preview.style.top = `${input.offsetTop}px`;
    preview.style.height = `${input.offsetHeight}px`;
    cellElement.append(preview);
    this.inlineAutocompletePreview = preview; this.inlineAutocompleteInput = input;
  }

  initMemoInput(input) {
    // Let the operating system IME handle both English and Korean input.
    // Converting insertText Latin keys here prevents native English entry.
    input.lang = 'ko';
    input.autocapitalize = 'off';
    input.spellcheck = false;
  }
}

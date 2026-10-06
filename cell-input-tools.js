// In-cell completion is a visual overlay; candidate text never enters the native input.
class PTCellInputTools {
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

  updateInlineAutocompletePreview() {
    this.clearInlineAutocompletePreview();
    const state = this.autocompleteState;
    if (!state || !['name', 'chartNo', 'part', 'prescription', 'extra', 'memo', 'specialNote'].includes(state.colKey)) return;
    const { input, cellElement } = state;
    if (!input.isConnected || document.activeElement !== input || !input.value ||
        input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
    const suffix = this.getInlineCompletionSuffix(input.value, this.getSelectedAutocompleteItem());
    if (!suffix) return;
    const preview = document.createElement('span');
    preview.className = 'inline-autocomplete-preview'; preview.setAttribute('aria-hidden', 'true');
    const prefix = document.createElement('span'); prefix.className = 'inline-completion-prefix'; prefix.textContent = input.value;
    const rest = document.createElement('span'); rest.className = 'inline-completion-suffix'; rest.textContent = suffix;
    preview.append(prefix, rest);
    input.classList.add('has-inline-completion');
    preview.style.left = `${input.offsetLeft - input.scrollLeft}px`;
    preview.style.top = `${input.offsetTop}px`;
    preview.style.height = `${input.offsetHeight}px`;
    cellElement.append(preview);
    this.inlineAutocompletePreview = preview; this.inlineAutocompleteInput = input;
  }

  initMemoKoreanInput(input, cell) {
    if (input.dataset.memoInitialized) return;
    input.dataset.memoInitialized = 'true';
    input.lang = 'ko'; input.autocapitalize = 'off'; input.spellcheck = false;
    const toggle = document.createElement('button'); toggle.type = 'button';
    toggle.className = 'memo-language-toggle'; toggle.textContent = '한';
    toggle.title = '한글 우선 입력 · 클릭 또는 Shift+Space로 영문 전환';
    const switchLanguage = () => {
      input.dataset.memoEnglish = input.dataset.memoEnglish === 'true' ? 'false' : 'true';
      input.dataset.composing = 'false';
      toggle.textContent = input.dataset.memoEnglish === 'true' ? 'EN' : '한';
      toggle.setAttribute('aria-label', input.dataset.memoEnglish === 'true' ? '영문 입력, 한글로 전환' : '한글 우선 입력, 영문으로 전환');
    };
    toggle.setAttribute('aria-label', '한글 우선 입력, 영문으로 전환');
    toggle.addEventListener('pointerdown', event => event.preventDefault());
    toggle.addEventListener('click', () => { switchLanguage(); input.focus({preventScroll:true}); });
    cell.append(toggle);
    input.addEventListener('keydown', event => {
      if (event.shiftKey && event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation(); switchLanguage();
      }
    });
    input.addEventListener('beforeinput', event => {
      if (input.dataset.memoEnglish === 'true' || event.isComposing || event.inputType !== 'insertText' || !/^[a-z]+$/i.test(event.data || '')) return;
      event.preventDefault();
      input.dataset.composing = 'true';
      const typed = this.convertMemoKeyboardInput(event.data);
      const start = input.selectionStart, end = input.selectionEnd;
      const before = this.assembleMemoInput(input.value.slice(0, start) + typed);
      input.value = before + input.value.slice(end);
      input.setSelectionRange(before.length, before.length);
      input.dispatchEvent(new Event('input', {bubbles:true}));
    });
    input.addEventListener('blur', () => toggle.remove());
  }

  convertMemoKeyboardInput(text) {
    const latin = 'rsefaqtdwczxvg';
    const consonants = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
    const vowels = {k:'ㅏ',o:'ㅐ',i:'ㅑ',j:'ㅓ',p:'ㅔ',u:'ㅕ',h:'ㅗ',y:'ㅛ',n:'ㅜ',b:'ㅠ',m:'ㅡ',l:'ㅣ'};
    const shifted = {R:'ㄲ',E:'ㄸ',Q:'ㅃ',T:'ㅆ',W:'ㅉ',O:'ㅒ',P:'ㅖ'};
    return Array.from(text, key => shifted[key] || vowels[key.toLowerCase()] || consonants[latin.indexOf(key.toLowerCase())] || key).join('');
  }

  assembleMemoInput(text) {
    const splitFinals = {3:'ㄱㅅ',5:'ㄴㅈ',6:'ㄴㅎ',9:'ㄹㄱ',10:'ㄹㅁ',11:'ㄹㅂ',12:'ㄹㅅ',13:'ㄹㅌ',14:'ㄹㅍ',15:'ㄹㅎ',18:'ㅂㅅ'};
    return this.assembleHangul(Array.from(text, char => {
      const code = char.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171 || !splitFinals[code % 28]) return char;
      return String.fromCharCode(0xac00 + code - code % 28) + splitFinals[code % 28];
    }).join(''));
  }
}

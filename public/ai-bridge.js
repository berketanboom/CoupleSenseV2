// public/ai-bridge.js  (v2.6: multi-turn chat + OCR + strict language)
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const isVisible = (el) => !!el && el.offsetParent !== null;

  // ---------- helpers ----------
  function getLanguage() {
    try {
      const sel = $$('select').find(s => /Türkçe|English/i.test(s.textContent || ''));
      if (sel) {
        const v = (sel.value || sel.selectedOptions?.[0]?.value || '').toLowerCase();
        if (v.startsWith('tr')) return 'tr';
        if (v.startsWith('en')) return 'en';
      }
      const html = (document.documentElement.getAttribute('lang') || '').toLowerCase();
      return html.startsWith('tr') ? 'tr' : 'en';
    } catch { return 'en'; }
  }
  function getGender() {
    const sel = $('.pane.selected') || $$('.pane').find(p => p.getAttribute('aria-pressed') === 'true');
    const t = (sel?.textContent || '').toLowerCase();
    if (/female|kadın/.test(t)) return 'female';
    if (/male|erkek/.test(t)) return 'male';
    return 'unknown';
  }
  function getStyle() {
    const s = $$('select').find(x => /Neutral|Funny|Serious|Emotional|Logical/i.test(x.textContent || ''));
    return s ? s.value : 'neutral';
  }
  function getFeelings() { return $$('.chip.selected').map(el => (el.textContent || '').trim()).filter(Boolean); }

  function getVisibleTextarea() { return $$('textarea').find(isVisible) || null; }
  function getMessage() { const t = getVisibleTextarea(); return t?.value?.trim() || ''; }

  // send butonu (yalnızca textarea içindeki bölümde)
  function findSendButtonsNearTextarea() {
    const txt = getVisibleTextarea();
    if (!txt) return [];
    const container = txt.closest('section, form, div') || document;
    const btns = $$('button,[role="button"],input[type="submit"]', container);
    return btns.filter(b => {
      const t = (b.textContent || b.value || '').trim().toLowerCase();
      if (/send|gönder/.test(t)) return true;
      if ((b.getAttribute('data-role') || '').toLowerCase() === 'analyze') return true;
      return false;
    });
  }

  // ---------- chat ui ----------
  function getChat() {
    let box = $('#chatBox');
    if (box) return box;
    const t = getVisibleTextarea();
    box = document.createElement('div');
    box.id = 'chatBox';
    box.style.cssText = 'margin-top:12px; display:flex; flex-direction:column; gap:8px;';
    (t?.parentElement || document.body).appendChild(box);
    return box;
  }
  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = role === 'user' ? 'bubble user' : 'bubble ai';
    el.textContent = text;
    el.style.cssText = `
      align-self:${role === 'user' ? 'flex-end' : 'flex-start'};
      max-width: 90%; padding:10px 12px; border-radius:14px;
      white-space:pre-wrap; word-break:break-word;
      background:${role === 'user' ? 'var(--bubble-user)' : 'var(--bubble-ai)'};
      border:1px solid var(--stroke); color:var(--text);
    `;
    getChat().appendChild(el);
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return el;
  }
  function typing() {
    const el = bubble('ai', getLanguage() === 'tr' ? 'Yazıyor…' : 'Typing…');
    el.dataset.typing = '1'; el.style.opacity = '0.75';
    return el;
  }
  function replace(el, txt) { el.textContent = txt; el.style.opacity = '1'; delete el.dataset.typing; }

  // ---------- OCR (file, paste, drag-drop) ----------
  let tesseractReady = null;
  function loadTesseract() {
    if (tesseractReady) return tesseractReady;
    tesseractReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Tesseract load failed'));
      document.head.appendChild(s);
    });
    return tesseractReady;
  }
  async function runOCRFromFile(file, lang) {
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(file, lang === 'tr' ? 'tur' : 'eng', { logger: () => {} });
      return (data?.text || '').trim();
    } catch { return ''; }
  }
  function findFileInputNearTextarea() {
    const t = getVisibleTextarea();
    if (!t) return null;
    const container = t.closest('section, form, div') || document;
    const inputs = $$('input[type="file"]', container);
    return inputs.find(isVisible) || null;
  }
  function enablePasteAndDropForOCR() {
    const area = getVisibleTextarea()?.closest('section, form, div') || document;
    if (!area || area.__csOCRBound) return;
    area.addEventListener('paste', async (e) => {
      const lang = getLanguage();
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            bubble('ai', lang === 'tr' ? 'Görsel alındı, analiz ediliyor…' : 'Image received, analyzing…');
            const text = await runOCRFromFile(file, lang);
            if (text) localStorage.setItem('cs_last_ocr', text);
          }
        }
      }
    });
    area.addEventListener('dragover', (e) => { e.preventDefault(); });
    area.addEventListener('drop', async (e) => {
      e.preventDefault();
      const lang = getLanguage();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        bubble('ai', lang === 'tr' ? 'Görsel alındı, analiz ediliyor…' : 'Image received, analyzing…');
        const text = await runOCRFromFile(file, lang);
        if (text) localStorage.setItem('cs_last_ocr', text);
      }
    });
    const input = findFileInputNearTextarea();
    if (input && !input.__csOCRBound) {
      input.addEventListener('change', async () => {
        const lang = getLanguage();
        const file = input.files?.[0];
        if (file && file.type.startsWith('image/')) {
          bubble('ai', lang === 'tr' ? 'Görsel alındı, analiz ediliyor…' : 'Image received, analyzing…');
          const text = await runOCRFromFile(file, lang);
          if (text) localStorage.setItem('cs_last_ocr', text);
        }
      });
      input.__csOCRBound = true;
    }
    area.__csOCRBound = true;
  }

  // ---------- history (multi-turn) ----------
  function getSessionId() {
    let sid = localStorage.getItem('sid');
    if (!sid) { sid = (crypto.randomUUID?.() || String(Date.now())); localStorage.setItem('sid', sid); }
    return sid;
  }
  function histKey() { return 'cs_history_' + getSessionId(); }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(histKey()) || '[]'); } catch { return []; } }
  function saveHistory(arr) { try { localStorage.setItem(histKey(), JSON.stringify(arr.slice(-12))); } catch {} } // son 12 tur
  function pushUser(msg) { const h = loadHistory(); h.push({ role:'user', content: msg }); saveHistory(h); }
  function pushAI(msg)   { const h = loadHistory(); h.push({ role:'assistant', content: msg }); saveHistory(h); }

  async function callAnalyze(payload, history) {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ...payload, history })
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error('Analyze failed: ' + res.status + ' ' + txt);
    }
    return res.json();
  }
  function formatResp(d) {
    const steps = Array.isArray(d?.mediation_steps) ? d.mediation_steps.map(s => `- ${s}`).join('\n') : '';
    return `${d?.translation||''}\n\n${d?.explanation||''}\n${steps}`.trim();
  }

  function buildBasePayload() {
    const language = getLanguage();
    const payload = {
      partnerGender: getGender(),
      feelings: getFeelings(),
      problems: [],
      partnerStyle: getStyle(),
      language,
      message: getMessage(),
      sessionId: getSessionId(),
      image_text: (localStorage.getItem('cs_last_ocr') || '')
    };
    // OCR metnini tek kullanımda temizle (bir sonraki mesaja taşmasın)
    localStorage.removeItem('cs_last_ocr');
    return payload;
  }

  async function onSendClick(e) {
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const p = buildBasePayload();
    if (!p.message) { bubble('ai', p.language==='tr'?'Lütfen partner mesajını yaz.':'Please enter your partner message.'); return; }

    // chat'e user mesajını ekle + geçmişe yaz
    bubble('user', p.message); pushUser(p.message);

    const typingEl = typing();
    try {
      const history = loadHistory(); // çok turlu geçmiş
      const data = await callAnalyze(p, history);
      const txt = formatResp(data);
      replace(typingEl, txt);
      pushAI(txt); // geçmişe AI cevabı
    } catch (err) {
      replace(typingEl, (err && (err.message||String(err))) || 'AI call failed');
    }
  }

  function bind() {
    const btns = findSendButtonsNearTextarea();
    if (!btns.length) return false;
    let n = 0;
    for (const b of btns) {
      if (b.__csBound) continue;
      b.addEventListener('click', onSendClick, { capture:true });
      b.__csBound = true; n++;
    }
    console.log('[CS-Bridge] bound send buttons:', n);
    enablePasteAndDropForOCR(); // aynı anda OCR yapıştırma/sürükle bırak aktifleşsin
    return n>0;
  }

  document.addEventListener('click', ()=>{ if (getVisibleTextarea()) bind(); });
  document.addEventListener('DOMContentLoaded', ()=>{
    let ok = bind(), tries = 0;
    const id = setInterval(()=>{ tries++; if(!ok) ok = bind(); if(tries>40 || ok) clearInterval(id); }, 500);
  });

  // manuel test
  window.__csForce = async ()=>{
    const p = buildBasePayload();
    if (!p.message) p.message = p.language==='tr' ? 'Bu hafta sonu görüşelim mi?' : 'Can we meet this weekend?';
    bubble('user', p.message); pushUser(p.message);
    const typingEl = typing();
    try {
      const history = loadHistory();
      const d = await callAnalyze(p, history);
      const txt = formatResp(d);
      replace(typingEl, txt); pushAI(txt);
      return d;
    } catch (e) {
      replace(typingEl, String(e?.message||e)); throw e;
    }
  };
  try { if (window.parent && window.parent!==window) window.parent.__csForce = window.__csForce; } catch(e){}
})();

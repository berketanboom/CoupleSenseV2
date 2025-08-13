// public/ai-bridge.js  (v2.4: chat bubbles + OCR + strict language)
(function(){
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const isVisible = (el)=> !!el && el.offsetParent !== null;

  // ---- helpers ----
  function getLanguage(){
    try{
      const sel=$$('select').find(s=>/Türkçe|English/i.test(s.textContent||''));
      if(sel){
        const v=(sel.value || sel.selectedOptions?.[0]?.value || '').toLowerCase();
        if(v.startsWith('tr')) return 'tr';
        if(v.startsWith('en')) return 'en';
      }
      const html=(document.documentElement.getAttribute('lang')||'').toLowerCase();
      return html.startsWith('tr') ? 'tr' : 'en';
    }catch{ return 'en' }
  }
  function getGender(){
    const sel=$('.pane.selected') || $$('.pane').find(p=>p.getAttribute('aria-pressed')==='true');
    const t=(sel?.textContent||'').toLowerCase();
    if(/female|kadın/.test(t)) return 'female';
    if(/male|erkek/.test(t)) return 'male';
    return 'unknown';
  }
  function getStyle(){
    const s=$$('select').find(x=>/Neutral|Funny|Serious|Emotional|Logical/i.test(x.textContent||''));
    return s ? s.value : 'neutral';
  }
  function getFeelings(){ return $$('.chip.selected').map(el=>(el.textContent||'').trim()).filter(Boolean) }

  function getVisibleTextarea(){ return $$('textarea').find(isVisible) || null }
  function getMessage(){
    const t = getVisibleTextarea();
    return t?.value?.trim() || '';
  }

  function findNearestFileInput(){
    const t = getVisibleTextarea();
    if(!t) return null;
    const container = t.closest('section, form, div') || document;
    const inputs = $$('input[type="file"]', container);
    return inputs.find(isVisible) || null;
  }

  // Chat container: varsa #chatBox, yoksa textarea altına yarat
  function getChat(){
    let box = $('#chatBox');
    if(box) return box;
    const t = getVisibleTextarea();
    box = document.createElement('div');
    box.id = 'chatBox';
    box.style.cssText = 'margin-top:12px; display:flex; flex-direction:column; gap:8px;';
    (t?.parentElement || document.body).appendChild(box);
    return box;
  }
  function bubble(role, text){
    const el = document.createElement('div');
    el.className = role==='user' ? 'bubble user' : 'bubble ai';
    el.textContent = text;
    el.style.cssText = `
      align-self:${role==='user'?'flex-end':'flex-start'};
      max-width: 90%;
      padding:10px 12px;border-radius:14px;
      white-space:pre-wrap;word-break:break-word;
      background:${role==='user'?'var(--bubble-user)':'var(--bubble-ai)'};
      border:1px solid var(--stroke); color:var(--text);
    `;
    getChat().appendChild(el);
    el.scrollIntoView({block:'end', behavior:'smooth'});
    return el;
  }
  function typing(){
    const el = bubble('ai', getLanguage()==='tr'?'Yazıyor…':'Typing…');
    el.dataset.typing='1';
    el.style.opacity = '0.75';
    return el;
  }
  function replace(el, txt){
    el.textContent = txt;
    el.style.opacity = '1';
    delete el.dataset.typing;
  }

  // OCR — Tesseract.js’i CDN’den dinamik yükle (anahtar gerekmez)
  let tesseractReady = null;
  function loadTesseract(){
    if (tesseractReady) return tesseractReady;
    tesseractReady = new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = ()=> resolve(window.Tesseract);
      s.onerror = ()=> reject(new Error('Tesseract load failed'));
      document.head.appendChild(s);
    });
    return tesseractReady;
  }
  async function runOCR(file, lang){
    try{
      const T = await loadTesseract();
      const { data } = await T.recognize(file, lang==='tr'?'tur':'eng', { logger: ()=>{} });
      return (data?.text || '').trim();
    }catch{
      return '';
    }
  }

  // Sadece textarea görüldüğünde "Send/Gönder" butonuna bağlan
  function findSendButtonsNearTextarea(){
    const txt = getVisibleTextarea();
    if(!txt) return [];
    const container = txt.closest('section, form, div') || document;
    const btns = $$('button,[role="button"],input[type="submit"]', container);
    return btns.filter(b=>{
      const t=(b.textContent||b.value||'').trim().toLowerCase();
      if(/send|gönder/.test(t)) return true;
      if((b.getAttribute('data-role')||'').toLowerCase()==='analyze') return true;
      return false;
    });
  }

  async function callAnalyze(payload){
    const res=await fetch('/api/analyze',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error('Analyze failed: '+res.status+' '+txt);
    }
    return res.json();
  }
  function formatResp(data){
    const steps=Array.isArray(data?.mediation_steps)?data.mediation_steps.map(s=>`- ${s}`).join('\n'):'';
    return `${data?.translation||''}\n\n${data?.explanation||''}\n${steps}`;
  }

  function buildBasePayload(){
    const language=getLanguage();
    const payload={
      partnerGender:getGender(),
      feelings:getFeelings(),
      problems:[],
      partnerStyle:getStyle(),
      language,
      message:getMessage(),
      sessionId:(localStorage.getItem('sid') || (crypto.randomUUID?.() || String(Date.now())))
    };
    localStorage.setItem('sid', payload.sessionId);
    return payload;
  }

  async function onSendClick(e){
    e.preventDefault(); e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    const payload = buildBasePayload();
    const lang = payload.language;
    if(!payload.message){
      bubble('ai', lang==='tr' ? 'Lütfen partner mesajını yaz.' : 'Please enter your partner message.');
      return;
    }

    // (Opsiyonel) Görselden OCR metni çek ve mesaja ekle
    const fileInput = findNearestFileInput();
    if(fileInput && fileInput.files && fileInput.files[0]){
      const imgText = await runOCR(fileInput.files[0], lang);
      if (imgText) {
        payload.image_text = imgText;
        // İpucu: kullanıcıya görsel metni kombine ettiğimizi göster
        bubble('ai', lang==='tr' ? 'Görsel analiz edildi, metin içeriği mesaja eklendi.' : 'Image analyzed, extracted text merged into the message.');
      } else {
        bubble('ai', lang==='tr' ? 'Görselden metin çıkarılamadı, yalnızca yazdığınız mesaj analiz edilecek.' : 'Could not extract text from image; analyzing your typed message only.');
      }
    }

    // Chat’e kullanıcı mesajını düş
    bubble('user', payload.message);

    const typingEl = typing();
    try{
      const data = await callAnalyze(payload);
      replace(typingEl, formatResp(data));
    }catch(err){
      replace(typingEl, (err && (err.message||String(err))) || 'AI call failed');
    }
  }

  function bind(){
    const btns=findSendButtonsNearTextarea();
    if(!btns.length) return false;
    let n=0;
    for(const b of btns){
      if(b.__csBound) continue;
      b.addEventListener('click', onSendClick, { capture:true });
      b.__csBound = true;
      n++;
    }
    console.log('[CS-Bridge] bound send buttons:', n);
    return n>0;
  }

  document.addEventListener('click', ()=>{ if(getVisibleTextarea()) bind() });
  document.addEventListener('DOMContentLoaded', ()=>{
    let ok=bind(), tries=0;
    const id=setInterval(()=>{tries++; if(!ok) ok=bind(); if(tries>40||ok) clearInterval(id)},500);
  });

  // Manual test
  window.__csForce = async ()=>{
    if(!getVisibleTextarea()) return 'Textarea not visible yet.';
    const p = buildBasePayload();
    if(!p.message) p.message = p.language==='tr'?'Bu hafta sonu görüşelim mi?':'Can we meet this weekend?';
    const typingEl = typing();
    try{
      const data = await callAnalyze(p);
      replace(typingEl, formatResp(data));
      return data;
    }catch(err){
      replace(typingEl, String(err?.message||err));
      throw err;
    }
  };
  try{ if(window.parent && window.parent!==window) window.parent.__csForce = window.__csForce }catch(e){}
})();

// public/ai-bridge.js  (robust bridge, capture + test helper)
(function(){
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function getLanguage(){
    try{
      const langSel = $$('select').find(s => /Türkçe|English/i.test(s.textContent||''));
      if(langSel){
        const v = (langSel.value || langSel.selectedOptions?.[0]?.value || '').toLowerCase();
        if (v.startsWith('tr')) return 'tr';
        if (v.startsWith('en')) return 'en';
      }
      const htmlLang = (document.documentElement.getAttribute('lang')||'').toLowerCase();
      return htmlLang.startsWith('tr') ? 'tr' : 'en';
    }catch{ return 'en' }
  }
  function getGender(){
    const sel = $('.pane.selected') || $$('.pane').find(p => p.getAttribute('aria-pressed')==='true');
    const text = (sel?.textContent||'').toLowerCase();
    if (/female|kadın/.test(text)) return 'female';
    if (/male|erkek/.test(text)) return 'male';
    const left = $('.split .left'); const right = $('.split .right');
    if (left?.classList.contains('selected')) return 'female';
    if (right?.classList.contains('selected')) return 'male';
    return 'unknown';
  }
  function getStyle(){
    const s = $$('select').find(x => /Neutral|Funny|Serious|Emotional|Logical/i.test(x.textContent||''));
    return s ? s.value : 'neutral';
  }
  function getFeelings(){
    return $$('.chip.selected').map(el => (el.textContent||'').trim()).filter(Boolean);
  }
  function getMessage(){
    const tAreas = $$('textarea').sort((a,b)=>(b.value?.length||0)-(a.value?.length||0));
    const t = tAreas[0] || $('textarea');
    return t?.value?.trim() || '';
  }
  function findSendButtons(){
    const btns = $$('button,[role="button"],input[type="submit"]');
    const res = btns.filter(b=>{
      const txt = (b.textContent||b.value||'').trim().toLowerCase();
      if (/send|gönder/.test(txt)) return true;
      if ((b.getAttribute('data-role')||'').toLowerCase()==='analyze') return true;
      if (b.classList?.contains('btn') && b.classList?.contains('brand')) return true;
      return false;
    });
    return res.length? res : btns.slice(-1);
  }
  function getOutputSlot(){
    let out = $('#aiOutput, .ai-output');
    if (!out) {
      const t = $('textarea');
      out = document.createElement('div');
      out.id = 'aiOutput';
      out.style.cssText = 'margin-top:12px;background:var(--muted);border:1px solid var(--stroke);border-radius:12px;padding:12px;white-space:pre-wrap;';
      (t?.parentElement||document.body).appendChild(out);
    }
    return out;
  }
  async function callAnalyze(payload){
    const endpoint = (window.COUPLESENSE_API || '/api/analyze');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error('Analyze failed: ' + res.status + ' ' + t);
    }
    return res.json();
  }
  function formatResp(data){
    const steps = Array.isArray(data?.mediation_steps) ? data.mediation_steps.map(s => `- ${s}`).join('\n') : '';
    return `${data?.translation||''}\n\n${data?.explanation||''}\n${steps}`;
  }
  function buildPayload(){
    const lang = getLanguage();
    const payload = {
      partnerGender: getGender(),
      feelings: getFeelings(),
      problems: [],
      partnerStyle: getStyle(),
      language: lang,
      message: getMessage(),
      sessionId: (localStorage.getItem('sid') || (crypto.randomUUID?.() || String(Date.now())))
    };
    localStorage.setItem('sid', payload.sessionId);
    return { payload, lang };
  }
  async function onClickCapture(e){
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    const out = getOutputSlot();
    const { payload, lang } = buildPayload();
    if(!payload.message){
      out.textContent = (lang==='tr' ? 'Lütfen partner mesajını girin.' : 'Please enter your partner message.');
      return;
    }
    out.textContent = (lang==='tr' ? 'Analiz ediliyor…' : 'Analyzing…');
    try{
      const data = await callAnalyze(payload);
      out.textContent = formatResp(data);
    }catch(err){
      out.textContent = (err && (err.message||err.toString())) || 'AI call failed';
    }
  }
  function bind(){
    const btns = findSendButtons();
    if(!btns || !btns.length) return false;
    let bound = 0;
    for (const b of btns){
      if (b.__csBound) continue;
      b.addEventListener('click', onClickCapture, { capture:true });
      b.__csBound = true;
      bound++;
    }
    return bound>0;
  }
  async function __csForce(){
    const { payload } = buildPayload();
    if(!payload.message) payload.message = payload.language==='tr' ? 'Bu hafta sonu görüşelim mi?' : 'Can we meet this weekend?';
    const data = await callAnalyze(payload);
    const out = getOutputSlot();
    out.textContent = formatResp(data);
    return data;
  }
  window.__csForce = __csForce;
  try{ if (window.parent && window.parent !== window) window.parent.__csForce = __csForce; }catch(e){}

  document.addEventListener('DOMContentLoaded', ()=>{
    let ok = bind();
    let tries = 0;
    const id = setInterval(()=>{
      tries++;
      if (!ok) ok = bind();
      if (tries>40 || ok) clearInterval(id);
    }, 500);
  });
})();

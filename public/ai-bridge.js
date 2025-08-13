// public/ai-bridge.js  (v2.2: bind only to send button near textarea)
(function(){
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  const isVisible = (el)=> !!el && el.offsetParent !== null;

  function getLanguage(){
    try{
      const sel=$$('select').find(s=>/Türkçe|English/i.test(s.textContent||''));
      if(sel){
        const v=(sel.value||sel.selectedOptions?.[0]?.value||'').toLowerCase();
        if(v.startsWith('tr')) return 'tr';
        if(v.startsWith('en')) return 'en';
      }
      const html=(document.documentElement.getAttribute('lang')||'').toLowerCase();
      return html.startsWith('tr')?'tr':'en';
    }catch{return 'en'}
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
  function getMessage(){
    // sadece görünen textarea
    const visibles=$$('textarea').filter(isVisible);
    const t = visibles.sort((a,b)=>(b.value?.length||0)-(a.value?.length||0))[0] || $('textarea');
    return t?.value?.trim() || '';
  }
  function findSendButtons(){
    // 1) Önce görünen textarea'yı bul
    const txt = $$('textarea').find(isVisible) || $('textarea');
    if(!txt) return [];
    // 2) En yakın kapsayıcı (section/form/div)
    const container = txt.closest('section, form, div') || document;
    // 3) Sadece BU kapsayıcı içindeki butonları tara
    const btns = $$('button,[role="button"],input[type="submit"]', container);
    // 4) Sadece "Send/Gönder" yazılı olanları veya data-role="analyze" olanı al
    const res = btns.filter(b=>{
      const t=(b.textContent||b.value||'').trim().toLowerCase();
      if (/send|gönder/.test(t)) return true;
      if ((b.getAttribute('data-role')||'').toLowerCase()==='analyze') return true;
      return false;
    });
    return res;
  }
  function getOutput(){
    let out=$('#aiOutput, .ai-output'); if(out) return out;
    const txt = $$('textarea').find(isVisible) || $('textarea');
    out=document.createElement('div');
    out.id='aiOutput';
    out.style.cssText='margin-top:12px;background:var(--muted);border:1px solid var(--stroke);border-radius:12px;padding:12px;white-space:pre-wrap;';
    (txt?.parentElement||document.body).appendChild(out);
    return out;
  }
  async function call(payload){
    const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok){throw new Error('Analyze failed: '+res.status+' '+await res.text().catch(()=>''))}
    return res.json();
  }
  function formatResp(data){
    const steps=Array.isArray(data?.mediation_steps)?data.mediation_steps.map(s=>`- ${s}`).join('\n'):'';
    return `${data?.translation||''}\n\n${data?.explanation||''}\n${steps}`;
  }
  function buildPayload(){
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
    return { payload, language };
  }
  async function onSendClick(e){
    // SADECE "Send/Gönder" butonuna bağlıyız, diğer butonlara karışmıyoruz
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();

    const { payload, language } = buildPayload();
    const out=getOutput();
    if(!payload.message){
      out.textContent = language==='tr' ? 'Lütfen partner mesajını girin.' : 'Please enter your partner message.';
      return;
    }
    out.textContent = language==='tr' ? 'Analiz ediliyor…' : 'Analyzing…';
    try{
      const data=await call(payload);
      out.textContent = formatResp(data);
    }catch(err){
      out.textContent = String(err?.message||err);
    }
  }
  function bind(){
    const btns=findSendButtons();
    if(!btns.length) return false;
    let n=0;
    for(const b of btns){
      if(b.__csBound) continue;
      // capture: true → UI’daki eski onclick’i geçersiz kılmak için sadece SEND butonunda
      b.addEventListener('click', onSendClick, { capture:true });
      b.__csBound=true; n++;
    }
    console.log('[CS-Bridge] bound send buttons:', n);
    return n>0;
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    let ok=bind(), tries=0;
    const id=setInterval(()=>{tries++; if(!ok) ok=bind(); if(tries>40||ok) clearInterval(id)},500);
  });

  // Test helper
  window.__csForce=async ()=>{
    const { payload } = buildPayload();
    if(!payload.message) payload.message = payload.language==='tr'?'Bu hafta sonu görüşelim mi?':'Can we meet this weekend?';
    const data=await call(payload);
    const out=getOutput(); out.textContent=formatResp(data); return data;
  };
  try{ if(window.parent&&window.parent!==window) window.parent.__csForce=window.__csForce }catch(e){}
})();

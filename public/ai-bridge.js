// public/ai-bridge.js
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function getLanguage(){
  const langSel = $$('select').find(s => /Türkçe|English/i.test(s.textContent||''));
  if(langSel){
    const v = (langSel.value || langSel.selectedOptions[0]?.value || '').toLowerCase();
    if (v.startsWith('tr')) return 'tr';
    if (v.startsWith('en')) return 'en';
  }
  const htmlLang = (document.documentElement.getAttribute('lang')||'').toLowerCase();
  return htmlLang.startsWith('tr') ? 'tr' : 'en';
}

function getGender(){
  const sel = $('.pane.selected') || $$('.pane').find(p => p.getAttribute('aria-pressed')==='true');
  const text = (sel?.textContent||'').toLowerCase();
  if (/female|kadın/.test(text)) return 'female';
  if (/male|erkek/.test(text)) return 'male';
  const left = $('.split .left'); const right = $('.split .right');
  if (left?.classList.contains('selected')) return 'female';
  if (right?.classList.contains('selected')) return 'male';
  return '';
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

function findSendButton(){
  const btns = $$('button,[role="button"],input[type="submit"]');
  return btns.find(b=>{
    const txt = (b.textContent||b.value||'').trim().toLowerCase();
    return /send|gönder/.test(txt) || b.getAttribute('data-role')==='analyze';
  });
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

function bind(){
  const btn = findSendButton();
  if(!btn) return;
  if(btn.__csBound) return;
  btn.__csBound = true;

  btn.addEventListener('click', async (e)=>{
    try{
      e.preventDefault();
      const out = getOutputSlot();
      const lang = getLanguage();
      const payload = {
        partnerGender: getGender() || 'female',
        feelings: getFeelings(),
        problems: [],
        partnerStyle: getStyle(),
        language: lang==='tr' ? 'tr' : 'en',
        message: getMessage(),
        sessionId: (localStorage.getItem('sid') || (crypto.randomUUID?.() || String(Date.now())))
      };
      localStorage.setItem('sid', payload.sessionId);
      out.textContent = (lang==='tr' ? 'Analiz ediliyor…' : 'Analyzing…');

      const data = await callAnalyze(payload);
      out.textContent = formatResp(data);
    }catch(err){
      const out = getOutputSlot();
      out.textContent = (err && (err.message||err.toString())) || 'AI call failed';
    }
  }, { passive:false });
}

document.addEventListener('DOMContentLoaded', ()=>{
  bind();
  let tries = 0;
  const id = setInterval(()=>{
    tries++;
    bind();
    if(tries>40) clearInterval(id);
  }, 500);
});

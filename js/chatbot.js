/* =========================================================
   DigitalEase Help Assistant — OpenRouter-powered chat widget
   -----------------------------------------------------------
   HOW THE KEY IS HANDLED (read this before deploying):

   This site is static (GitHub Pages). A static site cannot keep any
   value truly secret — everything shipped to the browser, "encrypted"
   or not, can be read by the user, because the decryption code has to
   ship alongside it. So this widget supports two honest modes:

   1. PROXY MODE (fully hides your key, recommended for a public repo):
      deploy /worker/openrouter-worker.js (free Cloudflare Worker) and
      paste its URL into ASSISTANT_PROXY_URL below. Your real key lives
      only in the worker's environment variables — never in this repo,
      never sent to the browser.

   2. GITHUB ACTIONS SECRET (keeps the key out of your repo/git history;
      see .github/workflows/deploy.yml). A workflow reads a repo secret
      called OPENROUTER_API_KEY and writes it into js/config.js at build
      time, which is deployed alongside the site. IMPORTANT: this keeps
      the key out of your source files and commit history, but the
      built page GitHub Pages serves still contains it in plain text —
      a visitor using "View Source" can still find it. It is a real
      improvement (no key in git, easy to rotate/revoke) but it is NOT
      the same as true secrecy from visitors. Use Option 1 for that.

   3. BYO KEY (fallback if neither of the above is set): each visitor
      pastes their own free OpenRouter key into Settings. It is stored
      only in that browser's localStorage.

   Do NOT paste a real OpenRouter key directly into this file if this
   repo is public — anyone who views the page source (or GitHub's own
   secret-scanning bots) will find it within minutes, and OpenRouter
   will likely rate-limit or revoke it.
   ========================================================= */

// Paste your deployed worker URL here once you've completed the proxy
// setup below (e.g. 'https://digitalease-assistant-proxy.YOURNAME.workers.dev').
// Leave blank to fall back to BYO-key mode.
const ASSISTANT_PROXY_URL = '';

// TEMPORARY hardcoded key, for local testing only.
// ⚠️ Do NOT commit/push this to a public repo with a real value filled in —
// it will be exposed in page source and picked up by GitHub's secret
// scanners within minutes. Fill it in locally, test, then either blank it
// out again before pushing, or switch to the proxy option above.
const TEMP_HARDCODED_KEY = '';

// Default free model. OpenRouter's free roster rotates — if this model
// stops working, check https://openrouter.ai/models?max_price=0 and
// update DEFAULT_MODEL, or let users override it in Settings.
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

const OR_KEY_STORAGE = 'digitalease_or_key';
const OR_MODEL_STORAGE = 'digitalease_or_model';
const CHAT_HISTORY_LIMIT = 12; // messages kept for context, keeps requests small/cheap

const SYSTEM_PROMPT = `You are the Help Assistant inside DigitalEase, a digital-literacy and
online-safety app for people who are new to technology or use older devices.
Always:
- Use short sentences and plain, everyday language. Avoid jargon; if you must use a
  technical word, explain it immediately in a few plain words.
- Be warm, patient, and encouraging. Never make the user feel silly for asking.
- If asked about a specific link or message being a scam, remind them to use the
  in-app Scam Checker tab for a proper check, and give general safety reminders
  (never share passwords or OTP codes, check the sender carefully, ask a trusted
  person if unsure).
- If asked about a job/employment term, you may explain it briefly, but point them
  to the Job Terms glossary tab for the full explanation and examples.
- You are not a lawyer, financial advisor, or doctor. For legal, financial, medical,
  or account-specific problems, tell them clearly to contact the relevant official
  service or a trusted person, rather than guessing.
- Keep answers short — a few sentences — unless the user asks for more detail.`;

let chatOpen = false;
let chatHistory = []; // {role, content}
let chatSending = false;

function getStoredKey(){
  return localStorage.getItem(OR_KEY_STORAGE)
    || TEMP_HARDCODED_KEY
    || (typeof window.OPENROUTER_INJECTED_KEY === 'string' ? window.OPENROUTER_INJECTED_KEY : '')
    || '';
}
function setStoredKey(v){ if(v) localStorage.setItem(OR_KEY_STORAGE, v); else localStorage.removeItem(OR_KEY_STORAGE); }
function getStoredModel(){ return localStorage.getItem(OR_MODEL_STORAGE) || DEFAULT_MODEL; }
function setStoredModel(v){ if(v) localStorage.setItem(OR_MODEL_STORAGE, v); else localStorage.removeItem(OR_MODEL_STORAGE); }

function assistantConfigured(){
  return !!ASSISTANT_PROXY_URL || !!getStoredKey();
}

// ---------- Widget shell ----------

function mountChatWidget(){
  if(document.getElementById('chatWidgetRoot')) return;
  const root = document.createElement('div');
  root.id = 'chatWidgetRoot';
  document.body.appendChild(root);

  // Bind delegated listeners ONCE on the container, not on the elements
  // inside it — this way clicks always work even after innerHTML is
  // replaced on every render, instead of relying on re-binding each time.
  root.addEventListener('click', (e)=>{
    if(e.target.closest('#chatToggleBtn')){
      chatOpen = !chatOpen;
      renderChatWidget();
      return;
    }
    if(e.target.closest('#chatCloseBtn')){
      chatOpen = false;
      renderChatWidget();
      return;
    }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && chatOpen){ chatOpen = false; renderChatWidget(); }
  });

  renderChatWidget();
}

function renderChatWidget(){
  const root = document.getElementById('chatWidgetRoot');
  if(!root) return;

  root.innerHTML = `
    <button type="button" id="chatToggleBtn" class="chat-fab" aria-expanded="${chatOpen}" aria-controls="chatPanel">
      ${chatOpen ? 'Close Help Assistant' : 'Help Assistant'}
    </button>
    <section id="chatPanel" class="chat-panel" ${chatOpen ? '' : 'hidden'} aria-label="Help Assistant chat">
      <div class="chat-panel-head">
        <h2>Help Assistant</h2>
        <button type="button" id="chatCloseBtn" class="chat-close" aria-label="Close chat">×</button>
      </div>
      ${assistantConfigured() ? renderChatBody() : renderChatSetup()}
    </section>
  `;

  if(assistantConfigured()){
    wireChatBody();
  } else {
    wireChatSetup();
  }
}

function renderChatSetup(){
  return `
    <div class="chat-setup">
      <p>The Help Assistant answers plain-language questions about using this app and staying safe online. It needs a free OpenRouter API key to work.</p>
      <ol class="tight">
        <li>Go to <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> and sign up (free, no credit card needed).</li>
        <li>Create a key and copy it.</li>
        <li>Paste it below. It stays only in this browser — it is never sent anywhere except directly to OpenRouter.</li>
      </ol>
      <label for="chatKeyInput">OpenRouter API key</label>
      <input type="password" id="chatKeyInput" placeholder="sk-or-v1-..." autocomplete="off">
      <button class="btn block" id="chatKeySave">Save &amp; start chatting</button>
      <p class="muted chat-fineprint">You can remove this key any time from Account &amp; Settings.</p>
    </div>
  `;
}
function wireChatSetup(){
  const btn = document.getElementById('chatKeySave');
  if(!btn) return;
  btn.onclick = ()=>{
    const val = document.getElementById('chatKeyInput').value.trim();
    if(!val){ toast('Please paste a key first.'); return; }
    setStoredKey(val);
    toast('Key saved in this browser.');
    renderChatWidget();
  };
}

function renderChatBody(){
  const historyHtml = chatHistory.length
    ? chatHistory.map(m=>`<div class="chat-msg ${m.role}">${escapeHtml(m.content)}</div>`).join('')
    : `<div class="chat-msg assistant">Hi! Ask me anything about using DigitalEase, spotting scams, job terms, or managing your data. I keep things simple.</div>`;

  return `
    <div class="chat-messages" id="chatMessages" aria-live="polite">${historyHtml}</div>
    <form id="chatForm" class="chat-form">
      <label for="chatInput" class="sr-only">Type your question</label>
      <input type="text" id="chatInput" placeholder="Type your question..." autocomplete="off" ${chatSending?'disabled':''}>
      <button type="submit" class="btn" ${chatSending?'disabled':''}>${chatSending?'Sending…':'Send'}</button>
    </form>
    <p class="muted chat-fineprint">Answers are AI-generated and may be wrong — always verify anything important with an official source or a trusted person.</p>
  `;
}

function wireChatBody(){
  const form = document.getElementById('chatForm');
  if(!form) return;
  form.onsubmit = async (e)=>{
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text || chatSending) return;
    chatHistory.push({role:'user', content:text});
    if(chatHistory.length > CHAT_HISTORY_LIMIT) chatHistory = chatHistory.slice(-CHAT_HISTORY_LIMIT);
    chatSending = true;
    renderChatWidget();
    scrollChatToEnd();

    try{
      const reply = await callAssistant(chatHistory);
      chatHistory.push({role:'assistant', content:reply});
    }catch(err){
      chatHistory.push({role:'assistant', content: 'Sorry, something went wrong reaching the assistant: '+err.message});
    }finally{
      chatSending = false;
      renderChatWidget();
      scrollChatToEnd();
    }
  };
  setTimeout(()=>document.getElementById('chatInput')?.focus(), 30);
  scrollChatToEnd();
}

function scrollChatToEnd(){
  const box = document.getElementById('chatMessages');
  if(box) box.scrollTop = box.scrollHeight;
}

// ---------- OpenRouter call ----------
async function callAssistant(history){
  const messages = [{role:'system', content: SYSTEM_PROMPT}, ...history];

  if(ASSISTANT_PROXY_URL){
    // Proxy mode: the real key lives server-side in the worker, not here.
    const res = await fetch(ASSISTANT_PROXY_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages, model: getStoredModel() })
    });
    if(!res.ok) throw new Error('Assistant service returned an error ('+res.status+').');
    const data = await res.json();
    return extractReply(data);
  }

  // BYO-key mode: call OpenRouter directly with the user's own key.
  const key = getStoredKey();
  if(!key) throw new Error('No API key saved yet.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+key,
      'HTTP-Referer': location.origin,
      'X-Title': 'DigitalEase'
    },
    body: JSON.stringify({ model: getStoredModel(), messages })
  });
  if(res.status === 401){ throw new Error('That API key was rejected. Please check it in Settings.'); }
  if(res.status === 429){ throw new Error('The free model is rate-limited right now. Please wait a moment and try again.'); }
  if(!res.ok){ throw new Error('OpenRouter returned an error ('+res.status+').'); }
  const data = await res.json();
  return extractReply(data);
}

function extractReply(data){
  const content = data?.choices?.[0]?.message?.content;
  if(!content) throw new Error('The assistant did not return a reply.');
  return content.trim();
}

window.mountChatWidget = mountChatWidget;
window.getStoredKey = getStoredKey;
window.setStoredKey = setStoredKey;
window.getStoredModel = getStoredModel;
window.setStoredModel = setStoredModel;
window.renderChatWidget = renderChatWidget;
window.DEFAULT_ASSISTANT_MODEL = DEFAULT_MODEL;

// Mount the widget once this script loads (independent of the main app's render cycle).
mountChatWidget();



/* =========================================================
   DigitalEase — client-side prototype
   IMPORTANT LIMITATIONS (see summary at end of build):
   - This runs entirely in the browser. There is no real backend server,
     so "accounts" are stored in this browser's localStorage only, not
     a shared database. Passwords are hashed with SHA-256 client-side
     before storage as a demonstration of "never store plaintext" —
     this is NOT equivalent to a production system with a real server,
     bcrypt/Argon2id, HttpOnly cookies, or rate-limited login endpoints.
   - The Scam Checker uses a local heuristic engine plus a small bundled
     sample list standing in for live threat-intel feeds (URLhaus /
     ThreatFox), because this environment cannot call external malware
     databases or hold secret API keys server-side. Every result is
     labelled with which method produced it.
   ========================================================= */

// ---------- Utilities ----------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

function toast(msg){
  const host = $('#toastHost');
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role','status');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(()=>t.remove(), 3200);
}

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function todayStr(){ return new Date().toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

// ---------- Storage layer (stands in for a real database) ----------
const DB_KEY = 'digitalease_users_v1';
function loadUsers(){ try{ return JSON.parse(localStorage.getItem(DB_KEY))||{}; }catch(e){ return {}; } }
function saveUsers(u){ localStorage.setItem(DB_KEY, JSON.stringify(u)); }

let session = null; // { username }
let users = loadUsers();

function currentUser(){
  if(!session) return null;
  return users[session.username];
}
function persistCurrentUser(){
  if(session) { users[session.username] = users[session.username]; saveUsers(users); }
}

// ---------- Default account data shape ----------
function newAccount(username, passwordHash){
  return {
    username, passwordHash,
    createdAt: new Date().toISOString(),
    dataTracker: { allowanceGB:'', usedGB:'', resetDate:'', log:[] },
    habits: {
      lastCompletedDate: {}, // habitId -> date string (limits 1 reward/day per habit)
      streak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      points: 0,
      history: [] // {date, habitIds:[]}
    },
    glossaryLearned: [],
    prefs: { largerText:false }
  };
}

// ---------- Login attempt throttling (client-side simulation) ----------
const attemptKey = u => 'attempts_'+u;
function getAttempts(u){ return JSON.parse(localStorage.getItem(attemptKey(u))||'{"count":0,"lockUntil":0}'); }
function setAttempts(u,val){ localStorage.setItem(attemptKey(u), JSON.stringify(val)); }

// ================= RENDER ROUTER =================
let currentTab = 'landing';

function setTab(tab){
  currentTab = tab;
  render();
  window.scrollTo({top:0,behavior:'instant'});
}

function render(){
  renderHeader();
  renderNav();
  const main = $('#mainContent');
  main.innerHTML = '';
  if(!session){
    if(tab_requiresAuth(currentTab)) currentTab='landing';
  }
  const routes = {
    landing: renderLanding,
    register: renderRegister,
    login: renderLogin,
    dashboard: renderDashboard,
    scam: renderScamChecker,
    glossary: renderGlossary,
    data: renderDataTracker,
    habits: renderHabits,
    account: renderAccount
  };
  (routes[currentTab]||renderLanding)(main);
}

function tab_requiresAuth(tab){
  return ['dashboard','data','habits','account'].includes(tab);
}

function renderHeader(){
  const actions = $('#headerActions');
  actions.innerHTML = '';
  if(session){
    const pill = document.createElement('span');
    pill.className='pill';
    pill.textContent = 'Hi, '+session.username;
    const logout = document.createElement('button');
    logout.className='btn secondary';
    logout.textContent='Log out';
    logout.onclick = ()=>{ session=null; toast('You have been logged out.'); setTab('landing'); };
    actions.appendChild(pill);
    actions.appendChild(logout);
  } else {
    const loginBtn = document.createElement('button');
    loginBtn.className='btn ghost';
    loginBtn.style.color='#fff'; loginBtn.style.borderColor='#fff';
    loginBtn.textContent='Log in';
    loginBtn.onclick = ()=>setTab('login');
    const regBtn = document.createElement('button');
    regBtn.className='btn gold';
    regBtn.textContent='Create account';
    regBtn.onclick = ()=>setTab('register');
    actions.appendChild(loginBtn);
    actions.appendChild(regBtn);
  }
}
$('#brandBtn').onclick = ()=> setTab(session?'dashboard':'landing');

function renderNav(){
  const nav = $('#tabsNav');
  if(!session){ nav.hidden = true; nav.innerHTML=''; return; }
  nav.hidden = false;
  const items = [
    ['dashboard','Dashboard'],
    ['scam','Scam Checker'],
    ['glossary','Job Terms'],
    ['data','Data Tracker'],
    ['habits','Habits & Streaks'],
    ['account','Account']
  ];
  nav.innerHTML = '';
  items.forEach(([id,label])=>{
    const b=document.createElement('button');
    b.textContent=label;
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', currentTab===id ? 'true':'false');
    b.onclick=()=>setTab(id);
    nav.appendChild(b);
  });
}

// ================= LANDING =================
function renderLanding(main){
  main.innerHTML = `
  <div class="landing-hero">
    <h1>Feel confident and safe online</h1>
    <p>DigitalEase helps you spot scams, understand confusing job terms, manage your mobile data, and build good digital habits — one small step at a time.</p>
    <div class="btn-row">
      <button class="btn gold" id="ctaRegister">Create Account</button>
      <button class="btn secondary" id="ctaLogin">Log In</button>
      <button class="btn ghost" id="ctaTry" style="border-color:#fff;color:#fff;">Try the Scam Checker</button>
    </div>
  </div>
  <div class="card">
    <h2>Who this is for</h2>
    <p>DigitalEase is built for anyone who feels left behind by technology — especially people using older phones or computers, or who are new to things like job applications, online banking, or mobile data plans. There is no such thing as a silly question here.</p>
  </div>
  <div class="feature-grid">
    <div class="feature-tile"><h3>Scam &amp; Link Checker</h3><p class="muted">Paste a link or message and get a plain-language safety check before you click.</p></div>
    <div class="feature-tile"><h3>Job Terms Explained</h3><p class="muted">Search over 50 everyday employment words, explained simply.</p></div>
    <div class="feature-tile"><h3>Data Usage Tracker</h3><p class="muted">Understand how much mobile data you have left and how to use less.</p></div>
    <div class="feature-tile"><h3>Daily Habits &amp; Streaks</h3><p class="muted">Build safer digital habits one day at a time, with gentle encouragement.</p></div>
  </div>
  <div class="notice">This is a prototype for learning and demonstration. Please read the "About this prototype" notes on the Account page for details on what is simulated versus real.</div>
  `;
  $('#ctaRegister').onclick = ()=>setTab('register');
  $('#ctaLogin').onclick = ()=>setTab('login');
  $('#ctaTry').onclick = ()=>{ currentTab='scam'; renderHeader(); renderNav(); renderScamChecker($('#mainContent'), true); };
}

// ================= REGISTER =================
function renderRegister(main){
  main.innerHTML = `
  <div class="card" style="max-width:440px;margin:0 auto;">
    <h1>Create your account</h1>
    <p class="muted">Only letters, numbers, periods and underscores are allowed in your username.</p>
    <form id="regForm" novalidate>
      <label for="regUser">Username</label>
      <input type="text" id="regUser" autocomplete="username" maxlength="30">
      <div class="field-error" id="regUserErr" aria-live="polite"></div>

      <label for="regPass">Password</label>
      <input type="password" id="regPass" autocomplete="new-password">
      <div class="field-hint">Use at least 8 characters. Try mixing letters and numbers.</div>
      <div class="field-error" id="regPassErr" aria-live="polite"></div>

      <label for="regPass2">Confirm password</label>
      <input type="password" id="regPass2" autocomplete="new-password">
      <div class="field-error" id="regPass2Err" aria-live="polite"></div>

      <button class="btn block" type="submit">Create Account</button>
    </form>
    <p class="muted" style="margin-top:14px;">Already have an account? <a href="#" id="toLogin">Log in</a></p>
  </div>`;
  $('#toLogin').onclick = (e)=>{e.preventDefault(); setTab('login');};

  $('#regForm').onsubmit = async (e)=>{
    e.preventDefault();
    const uField = $('#regUser'), pField = $('#regPass'), p2Field = $('#regPass2');
    const uErr = $('#regUserErr'), pErr = $('#regPassErr'), p2Err = $('#regPass2Err');
    uErr.textContent=''; pErr.textContent=''; p2Err.textContent='';
    const username = uField.value.trim();
    const password = pField.value;
    const password2 = p2Field.value;
    let ok = true;

    if(username.length===0){ uErr.textContent='Please enter a username.'; ok=false; }
    else if(!/^[A-Za-z0-9._]+$/.test(username)){ uErr.textContent='Only letters, numbers, periods and underscores are allowed — no spaces or symbols.'; ok=false; }
    else if(username.length>30){ uErr.textContent='Username must be 30 characters or fewer.'; ok=false; }
    else if(users[username]){ uErr.textContent='That username is already taken. Please choose another.'; ok=false; }

    if(password.length<8){ pErr.textContent='Password must be at least 8 characters.'; ok=false; }
    if(password!==password2){ p2Err.textContent='Passwords do not match.'; ok=false; }

    if(!ok) return;

    const hash = await sha256(password); // prototype hashing, see limitations note
    users[username] = newAccount(username, hash);
    saveUsers(users);
    session = { username };
    toast('Account created. Welcome to DigitalEase!');
    setTab('dashboard');
  };
}

// ================= LOGIN =================
function renderLogin(main){
  main.innerHTML = `
  <div class="card" style="max-width:440px;margin:0 auto;">
    <h1>Log in</h1>
    <form id="loginForm" novalidate>
      <label for="logUser">Username</label>
      <input type="text" id="logUser" autocomplete="username">
      <label for="logPass">Password</label>
      <input type="password" id="logPass" autocomplete="current-password">
      <div class="field-error" id="loginErr" aria-live="polite"></div>
      <button class="btn block" type="submit">Log In</button>
    </form>
    <p class="muted" style="margin-top:14px;">New here? <a href="#" id="toRegister">Create an account</a></p>
  </div>`;
  $('#toRegister').onclick = (e)=>{e.preventDefault(); setTab('register');};

  $('#loginForm').onsubmit = async (e)=>{
    e.preventDefault();
    const username = $('#logUser').value.trim();
    const password = $('#logPass').value;
    const errBox = $('#loginErr');
    errBox.textContent='';

    const attempts = getAttempts(username);
    if(attempts.lockUntil && Date.now() < attempts.lockUntil){
      const secs = Math.ceil((attempts.lockUntil - Date.now())/1000);
      errBox.textContent = `Too many attempts. Please try again in ${secs} seconds.`;
      return;
    }

    const user = users[username];
    const hash = await sha256(password);
    const valid = user && user.passwordHash === hash;

    if(!valid){
      const count = (attempts.count||0)+1;
      let lockUntil = 0;
      if(count>=5){ lockUntil = Date.now()+30000; }
      setAttempts(username, {count, lockUntil});
      errBox.textContent = 'Incorrect username or password.'; // generic, avoids account enumeration
      return;
    }
    setAttempts(username, {count:0, lockUntil:0});
    session = { username };
    toast('Welcome back, '+username+'!');
    setTab('dashboard');
  };
}

// ================= DASHBOARD =================
function renderDashboard(main){
  const u = currentUser();
  const h = u.habits;
  main.innerHTML = `
  <h1>Welcome back, ${escapeHtml(u.username)}</h1>
  <p class="muted">Here is your digital safety snapshot for today.</p>

  <div class="grid cols-2">
    <div class="card">
      <h2>Your streak</h2>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num">${h.streak}</div><div class="stat-label">Current streak</div></div>
        <div class="stat-box"><div class="stat-num">${h.longestStreak}</div><div class="stat-label">Longest streak</div></div>
        <div class="stat-box"><div class="stat-num">${h.points}</div><div class="stat-label">Points</div></div>
      </div>
      <button class="btn block" style="margin-top:14px;" onclick="setTab('habits')">Open today's checklist</button>
    </div>
    <div class="card">
      <h2>Data usage</h2>
      ${dashboardDataSummary(u)}
      <button class="btn secondary block" style="margin-top:10px;" onclick="setTab('data')">Open data tracker</button>
    </div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>Scam Checker</h2>
      <p class="muted">Got a suspicious link or message? Check it before you click or reply.</p>
      <button class="btn block" onclick="setTab('scam')">Check a link or message</button>
    </div>
    <div class="card">
      <h2>Job Terms</h2>
      <p class="muted">You've learned ${u.glossaryLearned.length} term${u.glossaryLearned.length===1?'':'s'} so far.</p>
      <button class="btn block" onclick="setTab('glossary')">Browse the glossary</button>
    </div>
  </div>
  `;
}
function dashboardDataSummary(u){
  const d = u.dataTracker;
  if(!d.allowanceGB || !d.usedGB){
    return `<p class="muted">You haven't set up your data tracker yet.</p>`;
  }
  const pct = Math.min(100, Math.round((parseFloat(d.usedGB)/parseFloat(d.allowanceGB))*100));
  const remaining = (parseFloat(d.allowanceGB)-parseFloat(d.usedGB)).toFixed(1);
  return `
    <p>${pct}% used — about ${remaining} GB remaining</p>
    <progress value="${pct}" max="100"></progress>`;
}

// ================= FEATURE A: SCAM CHECKER =================
// Small bundled sample list standing in for a live threat-intel feed lookup.
// In production this would be a server-side call to URLhaus / ThreatFox with a
// securely stored API key — see limitations note.
const SAMPLE_MALICIOUS_DOMAINS = [
  'free-gift-cardclaim.com','secure-login-update-bank.net','paypa1-verify.com',
  'urgent-account-suspended.info','you-won-a-prize-today.xyz','singpass-verify-now.com',
  'dbs-secure-alert.net','ocbc-update-info.com','crypto-double-your-btc.io'
];
const SUSPICIOUS_KEYWORDS_URL = ['verify','secure-login','update-account','claim-prize','win-now','urgent','suspended','free-gift','bit.ly','tinyurl','click-here'];
const SUSPICIOUS_KEYWORDS_TEXT = [
  'verify your account','urgent action required','you have won','claim your prize','click this link',
  'suspended your account','confirm your password','one time password','otp code','bank details',
  'gift card','wire transfer','act now','limited time','irs','tax refund','crypto investment','guaranteed returns'
];

function renderScamChecker(main, focusInput){
  main.innerHTML = `
  <h1>Scam &amp; Suspicious Link Checker</h1>
  <p class="muted">Paste a website link, or paste a suspicious message you received. We'll explain what we find in plain language.</p>

  <div class="card">
    <label for="scamInput">Website link or message text</label>
    <textarea id="scamInput" rows="4" placeholder="e.g. https://free-gift-cardclaim.com or a message you received"></textarea>
    <div class="field-hint">We only analyse the text you paste here. We never automatically open or visit links.</div>
    <button class="btn" id="checkBtn">Check</button>
    <div id="scamResult"></div>
  </div>

  <div class="card">
    <h2>Always stay safe</h2>
    <ul class="tight">
      <li>Never enter your password on a site you reached by clicking a link in a message.</li>
      <li>Never share One-Time Passwords (OTPs) or verification codes with anyone.</li>
      <li>Check the sender's email address or phone number carefully — scammers copy real logos.</li>
      <li>If you're not sure, ask a trusted friend, family member, or your bank directly.</li>
    </ul>
  </div>
  `;
  if(focusInput){ setTimeout(()=>$('#scamInput')?.focus(),50); }

  $('#checkBtn').onclick = ()=>{
    const raw = $('#scamInput').value.trim();
    const box = $('#scamResult');
    if(!raw){ box.innerHTML = `<div class="result-box warn"><div class="result-title">Please paste a link or message first</div></div>`; return; }
    box.innerHTML = `<p class="muted" style="margin-top:14px;">Checking…</p>`;
    setTimeout(()=>{
      const result = analyzeInput(raw);
      box.innerHTML = renderScamResult(result);
      if(session){ maybeCompleteHabit('checklink'); }
    }, 400); // simulated lookup delay
  };
}

function analyzeInput(raw){
  const looksLikeUrl = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(raw.split(/\s+/)[0]);
  let domain = null;
  if(looksLikeUrl){
    try{
      const withScheme = raw.startsWith('http') ? raw : 'http://'+raw;
      domain = new URL(withScheme.split(/\s+/)[0]).hostname.replace(/^www\./,'');
    }catch(e){ domain = null; }
  }

  // 1. Check against sample "known malicious" list (mock threat-intel DB lookup)
  if(domain && SAMPLE_MALICIOUS_DOMAINS.some(d=> domain===d || domain.endsWith('.'+d))){
    return {
      level:'danger', method:'database match (sample list)',
      title:'Known malicious match',
      body:`The domain "${domain}" matches an entry in our sample threat list, which stands in for real-time feeds like URLhaus and ThreatFox. Do not visit this site or enter any information.`
    };
  }

  // 2. Heuristic scoring
  const lower = raw.toLowerCase();
  let score = 0; const reasons = [];
  if(domain){
    if(/\d{1,3}(\.\d{1,3}){3}/.test(domain)){ score+=2; reasons.push('the address is a raw number (IP address) instead of a normal website name'); }
    if((domain.match(/-/g)||[]).length>=2){ score+=1; reasons.push('the domain name has several hyphens, a common scam pattern'); }
    if(domain.split('.').length>3){ score+=1; reasons.push('the domain has unusually many parts, which can be used to disguise the real destination'); }
    SUSPICIOUS_KEYWORDS_URL.forEach(k=>{ if(domain.includes(k)){ score+=1; reasons.push(`the address contains "${k}", often used in scam links`); }});
    if(/paypa1|amaz0n|micr0soft|g00gle|1cbc|0cbc/.test(domain)){ score+=3; reasons.push('the address looks like it is imitating a well-known brand with swapped characters'); }
  } else {
    SUSPICIOUS_KEYWORDS_TEXT.forEach(k=>{ if(lower.includes(k)){ score+=1; reasons.push(`the message uses the phrase "${k}", a common pressure tactic used by scammers`); }});
  }

  if(score>=3){
    return {
      level:'danger', method:'heuristic warning',
      title:'Suspicious — signs of a likely scam',
      body:'This was not found in a known-threat database, but it shows several strong warning signs.',
      reasons
    };
  }
  if(score>=1){
    return {
      level:'warn', method:'heuristic warning',
      title:'Suspicious or potentially risky',
      body:'No known-threat match was found, but this has some characteristics worth being cautious about.',
      reasons
    };
  }
  return {
    level:'unknown', method: domain ? 'database checked, no match' : 'no clear signals found',
    title: domain ? 'No known threat found' : 'Unable to fully verify',
    body: domain
      ? 'No known threat was found in the sources checked. This does not guarantee the website is safe — always stay cautious with personal information.'
      : "We couldn't detect a website address to check, and no strong scam signals were found in the text. Stay cautious, especially with requests for money, passwords, or codes."
  };
}

function renderScamResult(r){
  const iconMap = {danger:'', warn:'', unknown:''};
  let reasonsHtml = '';
  if(r.reasons && r.reasons.length){
    reasonsHtml = `<p style="margin-top:10px;"><strong>Why:</strong></p><ul class="tight">${r.reasons.slice(0,5).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  }
  return `
  <div class="result-box ${r.level}">
    <div class="result-title">${iconMap[r.level]} ${escapeHtml(r.title)} <span class="badge">${escapeHtml(r.method)}</span></div>
    <p>${escapeHtml(r.body)}</p>
    ${reasonsHtml}
    <p class="muted" style="margin-top:10px;">Reminder: even a "no known threat" result does not guarantee safety. Never share passwords or one-time codes, and ask a trusted person if you're unsure.</p>
  </div>`;
}

// ================= FEATURE B: EMPLOYMENT GLOSSARY =================
const GLOSSARY = [
 {t:'Resume / CV', c:'Applications', d:'A short document listing your work history, education, and skills, used to apply for jobs.', ex:'You attach your resume when you apply for a job online.'},
 {t:'Cover Letter', c:'Applications', d:'A short letter sent with your resume explaining why you want the job.', ex:'A good cover letter mentions why you are a good fit for the role.'},
 {t:'Job Application', c:'Applications', d:'The process of formally asking to be considered for a job, usually by submitting a resume and form.', ex:'You submit a job application through the company website.'},
 {t:'Job Portal', c:'Applications', d:'A website where employers post jobs and job seekers can apply.', ex:'MyCareersFuture is a job portal used in Singapore.'},
 {t:'Interview', c:'Applications', d:'A meeting where an employer asks you questions to decide if they should hire you.', ex:'Your interview may be in person, by phone, or by video call.'},
 {t:'References', c:'Applications', d:'People who can confirm your work history and character to a new employer.', ex:'A former manager can act as your reference.'},
 {t:'Qualifications', c:'Applications', d:'The education, certificates, or experience needed for a job.', ex:'The job requires a diploma as a minimum qualification.'},
 {t:'Skills', c:'Applications', d:'Abilities you have that help you do a job well.', ex:'Communication and computer skills are often listed on a resume.'},
 {t:'Job Description', c:'Applications', d:'A document listing the duties and expectations of a job.', ex:'Read the job description carefully before applying.'},
 {t:'Shortlisted', c:'Applications', d:'Being selected from many applicants to move to the next stage, such as an interview.', ex:'You were shortlisted after the company reviewed your resume.'},
 {t:'Job Offer', c:'Contracts', d:'A formal invitation from an employer to join the company, usually in writing.', ex:'You can negotiate salary after receiving a job offer.'},
 {t:'Employment Contract', c:'Contracts', d:'A written agreement between you and your employer covering pay, hours, and conditions.', ex:'Read your employment contract carefully before signing.'},
 {t:'Probation', c:'Contracts', d:'A trial period at the start of a job where either side can end employment more easily.', ex:'Your probation period may last 3 to 6 months.'},
 {t:'Notice Period', c:'Contracts', d:'The amount of time you must inform your employer before leaving a job, or they must inform you before ending it.', ex:'Your contract may require a one-month notice period.'},
 {t:'Termination', c:'Contracts', d:'The ending of an employment relationship, by the employer or the employee.', ex:'Termination without notice may only happen in serious cases.'},
 {t:'Resignation', c:'Contracts', d:'Formally choosing to leave your job.', ex:'You should submit a resignation letter to your employer.'},
 {t:'Non-Disclosure Agreement (NDA)', c:'Contracts', d:'A contract that says you cannot share certain company information.', ex:'You may need to sign an NDA before starting work on some projects.'},
 {t:'Full-Time', c:'Contracts', d:'A job with the standard number of working hours per week, usually with more benefits.', ex:'Full-time staff often get annual leave and medical benefits.'},
 {t:'Part-Time', c:'Contracts', d:'A job with fewer hours than full-time work.', ex:'Part-time workers are paid based on the hours they work.'},
 {t:'Freelance', c:'Contracts', d:'Working independently for different clients rather than one employer.', ex:'A freelance graphic designer works with several clients at once.'},
 {t:'Gross Salary', c:'Salary', d:'The amount of salary before any deductions such as CPF contributions.', ex:'If your gross salary is $2,500, the amount you receive after deductions may be lower.'},
 {t:'Net Salary', c:'Salary', d:'The amount you actually receive after deductions such as CPF and tax.', ex:'Your net salary is what is paid into your bank account.'},
 {t:'CPF (Central Provident Fund)', c:'Salary', d:'Singapore-specific: A compulsory savings scheme where a portion of your salary goes into a personal fund for retirement, housing, and healthcare. Both you and your employer contribute.', ex:'CPF contributions are automatically deducted from your gross salary each month.'},
 {t:'Payslip', c:'Salary', d:'A document from your employer showing your salary, deductions, and net pay for a period.', ex:'Check your payslip each month to make sure the amount is correct.'},
 {t:'Overtime', c:'Salary', d:'Extra pay for working beyond your normal hours.', ex:'You may be paid overtime for working on a public holiday.'},
 {t:'Bonus', c:'Salary', d:'Extra money paid on top of your regular salary, often once or twice a year.', ex:'Some companies pay a yearly bonus based on performance.'},
 {t:'Allowance', c:'Salary', d:'Extra money paid for a specific purpose, such as transport or meals.', ex:'Your company may give a transport allowance.'},
 {t:'Commission', c:'Salary', d:'Extra pay based on results, such as sales made.', ex:'A salesperson may earn commission for every item sold.'},
 {t:'Salary Deduction', c:'Salary', d:'Money subtracted from your gross salary, such as for CPF or unpaid leave.', ex:'CPF is the most common salary deduction in Singapore.'},
 {t:'Income Tax', c:'Salary', d:'A tax on your income paid to the government.', ex:'Singapore residents may need to file income tax each year.'},
 {t:'Working Hours', c:'Workplace', d:'The hours you are expected to work each day or week.', ex:'Standard working hours are often 9am to 6pm.'},
 {t:'Annual Leave', c:'Workplace', d:'Paid days off work that you are entitled to each year.', ex:'You may get 14 days of annual leave per year.'},
 {t:'Medical Leave', c:'Workplace', d:'Paid time off when you are unwell, usually with a doctor\'s certificate.', ex:'You should inform your employer if you are taking medical leave.'},
 {t:'Sick Leave', c:'Workplace', d:'Another common term for medical leave — time off due to illness.', ex:'Sick leave usually requires a medical certificate (MC).'},
 {t:'Medical Certificate (MC)', c:'Workplace', d:'A note from a doctor confirming you are unwell and unfit for work.', ex:'You submit your MC to HR to explain your absence.'},
 {t:'Public Holiday', c:'Workplace', d:'A day off recognised nationally, such as Chinese New Year or National Day.', ex:'Most employees do not need to work on a public holiday.'},
 {t:'Benefits', c:'Workplace', d:'Extra advantages provided by an employer besides salary, such as insurance.', ex:'Health insurance is a common employee benefit.'},
 {t:'Insurance Coverage', c:'Workplace', d:'Protection provided by an employer in case of illness or accident.', ex:'Your job may include medical insurance coverage.'},
 {t:'Onboarding', c:'Workplace', d:'The process of settling into a new job, including training and paperwork.', ex:'Your first week will include onboarding sessions.'},
 {t:'Supervisor / Manager', c:'Workplace', d:'The person who oversees your work and gives you instructions.', ex:'Speak to your supervisor if you have questions about your tasks.'},
 {t:'Human Resources (HR)', c:'Workplace', d:'The department that handles hiring, pay, and staff welfare.', ex:'Contact HR if you have questions about your payslip.'},
 {t:'Performance Review', c:'Workplace', d:'A regular meeting to discuss how well you are doing at work.', ex:'Your performance review may happen once a year.'},
 {t:'Job Confirmation', c:'Workplace', d:'Becoming a permanent employee after successfully completing probation.', ex:'You received your job confirmation letter after 3 months.'},
 {t:'Shift Work', c:'Workplace', d:'Work scheduled in rotating blocks of time, which may include nights or weekends.', ex:'Shift work is common in retail and healthcare jobs.'},
 {t:'Workplace Safety', c:'Workplace', d:'Rules and practices to keep employees safe from harm at work.', ex:'Wearing safety gear is part of good workplace safety.'},
 {t:'Union', c:'Workplace', d:'A group that represents workers\' interests, such as pay and conditions.', ex:'A union may help negotiate better working conditions.'},
 {t:'Retrenchment', c:'Workplace', d:'Losing your job because the company reduces staff, not due to your performance.', ex:'Workers affected by retrenchment may receive compensation.'},
 {t:'Retrenchment Benefit', c:'Workplace', d:'Compensation paid to an employee who is retrenched.', ex:'Retrenchment benefits depend on your years of service.'},
 {t:'Employment Pass', c:'Workplace', d:'Singapore-specific: A work visa for foreign professionals to work in Singapore.', ex:'Foreign employees often need an Employment Pass to work legally in Singapore.'},
 {t:'Work Permit', c:'Workplace', d:'Singapore-specific: A type of work pass for lower-waged foreign workers in specific sectors.', ex:'A Work Permit holder must work for the employer listed on the permit.'},
 {t:'Minimum Wage / Progressive Wage', c:'Salary', d:'Singapore-specific: Singapore does not have a general minimum wage, but has a Progressive Wage Model setting minimum pay in certain sectors.', ex:'Cleaners in Singapore are covered under the Progressive Wage Model.'},
 {t:'SkillsFuture', c:'Workplace', d:'Singapore-specific: A national initiative giving credits to help residents pay for courses to improve their skills.', ex:'You can use SkillsFuture credits to pay for a computer course.'},
 {t:'Direct Deposit', c:'Salary', d:'Salary paid directly into your bank account instead of by cheque or cash.', ex:'Most companies pay salary by direct deposit each month.'},
 {t:'Letter of Employment', c:'Contracts', d:'A formal letter confirming your job details, sometimes needed for loans or visas.', ex:'The bank asked for a letter of employment to process my loan.'},
];

let glossarySelectedCat = 'All';
let glossaryQuery = '';

function renderGlossary(main){
  const cats = ['All', ...Array.from(new Set(GLOSSARY.map(g=>g.c)))];
  main.innerHTML = `
  <h1>Employment Terms Explained</h1>
  <p class="muted">Search or browse everyday job and salary words, explained simply.</p>
  <div class="card">
    <label for="glossarySearch">Search a term</label>
    <input type="text" id="glossarySearch" placeholder="e.g. savings, salary, interview" value="${escapeHtml(glossaryQuery)}">
    <div class="chip-row" id="catChips"></div>
    <div id="glossaryList"></div>
  </div>
  `;
  const chipRow = $('#catChips');
  cats.forEach(c=>{
    const chip = document.createElement('button');
    chip.className='chip'; chip.textContent=c;
    chip.setAttribute('aria-pressed', glossarySelectedCat===c ? 'true':'false');
    chip.onclick = ()=>{ glossarySelectedCat=c; renderGlossary(main); };
    chipRow.appendChild(chip);
  });
  $('#glossarySearch').oninput = (e)=>{ glossaryQuery = e.target.value; renderGlossaryList(); };
  setTimeout(()=> $('#glossarySearch').setSelectionRange(glossaryQuery.length, glossaryQuery.length), 0);
  renderGlossaryList();
}

// simple synonym map so "savings" finds CPF, etc.
const SYNONYMS = {
  savings:['cpf'], retirement:['cpf'], fired:['termination','retrenchment'],
  quit:['resignation'], boss:['supervisor / manager'], vacation:['annual leave'],
  sick:['medical leave','medical certificate (mc)'], pay:['salary','gross salary','net salary','payslip'],
  visa:['employment pass','work permit'], training:['skillsfuture','onboarding']
};

function renderGlossaryList(){
  const listBox = $('#glossaryList');
  if(!listBox) return;
  const q = glossaryQuery.trim().toLowerCase();
  let extraMatches = [];
  if(q && SYNONYMS[q]) extraMatches = SYNONYMS[q];

  let items = GLOSSARY.filter(g=>{
    const inCat = glossarySelectedCat==='All' || g.c===glossarySelectedCat;
    if(!inCat) return false;
    if(!q) return true;
    const hay = (g.t+' '+g.d).toLowerCase();
    return hay.includes(q) || extraMatches.includes(g.t.toLowerCase());
  });

  if(items.length===0){
    listBox.innerHTML = `<p class="muted" style="margin-top:14px;">No terms matched. Try a different word.</p>`;
    return;
  }
  listBox.innerHTML = items.map(g=>`
    <div class="term-item">
      <div class="term-cat">${escapeHtml(g.c)}</div>
      <h3>${escapeHtml(g.t)}</h3>
      <p>${escapeHtml(g.d)}</p>
      <p class="muted"><em>Example: ${escapeHtml(g.ex)}</em></p>
      <button class="btn ghost" data-term="${escapeHtml(g.t)}" style="padding:6px 14px;font-size:.85rem;">Mark as learned</button>
    </div>
  `).join('');
  $$('#glossaryList button[data-term]').forEach(btn=>{
    btn.onclick = ()=>{
      const u = currentUser();
      if(!u){ toast('Log in to track what you\'ve learned!'); return; }
      const term = btn.dataset.term;
      if(!u.glossaryLearned.includes(term)){ u.glossaryLearned.push(term); saveUsers(users); }
      maybeCompleteHabit('learnterm');
      toast('Marked "'+term+'" as learned.');
    };
  });
}

// ================= FEATURE C: DATA TRACKER =================
function renderDataTracker(main){
  const u = currentUser();
  const d = u.dataTracker;
  main.innerHTML = `
  <h1>Data Usage Tracker</h1>
  <p class="muted">Your phone or website cannot automatically send us your real data usage. Enter the figures from your phone's Settings app or your mobile carrier's app, and we'll help you understand them.</p>

  <div class="card">
    <h2>Enter your data details</h2>
    <div class="grid cols-2">
      <div>
        <label for="allowance">Monthly data allowance (GB)</label>
        <input type="number" id="allowance" min="0" step="0.1" value="${escapeAttr(d.allowanceGB)}">
      </div>
      <div>
        <label for="used">Data used so far this month (GB)</label>
        <input type="number" id="used" min="0" step="0.1" value="${escapeAttr(d.usedGB)}">
      </div>
    </div>
    <label for="resetDate">When does your data plan reset?</label>
    <input type="date" id="resetDate" value="${escapeAttr(d.resetDate)}">
    <button class="btn" id="saveTracker">Save &amp; Calculate</button>
    <div id="trackerResult"></div>
  </div>

  <div class="card">
    <h2>Common data-consuming activities</h2>
    <ul class="tight">
      <li>Video streaming (Netflix, YouTube) — can use 1–3 GB per hour</li>
      <li>Social media (Instagram, TikTok, Facebook) — video content adds up fast</li>
      <li>Video calls (Zoom, WhatsApp video) — uses more data than voice calls</li>
      <li>App updates — can be several hundred MB each</li>
      <li>Music streaming — smaller, but adds up over hours of listening</li>
      <li>Automatic photo/video backups — can use a lot without you noticing</li>
    </ul>
  </div>

  <div class="card">
    <h2>Ways to save data</h2>
    <ul class="tight">
      <li>Connect to Wi-Fi at home or work before streaming or downloading.</li>
      <li>Turn off automatic photo/video backup when not on Wi-Fi.</li>
      <li>Lower video quality settings on streaming apps.</li>
      <li>Turn off automatic app updates over mobile data.</li>
      <li>Check which apps use the most data in your phone's settings.</li>
    </ul>
  </div>

  <div class="card">
    <h2>Finding your data usage on your phone</h2>
    <div class="grid cols-2">
      <div>
        <h3>Android</h3>
        <p class="muted">Settings → Network &amp; Internet → SIM/Mobile data → Data usage</p>
      </div>
      <div>
        <h3>iPhone</h3>
        <p class="muted">Settings → Mobile Data → scroll down to see usage by app</p>
      </div>
    </div>
  </div>
  `;
  renderTrackerResult();

  $('#saveTracker').onclick = ()=>{
    d.allowanceGB = $('#allowance').value;
    d.usedGB = $('#used').value;
    d.resetDate = $('#resetDate').value;
    d.log.push({date: todayStr(), usedGB: d.usedGB});
    saveUsers(users);
    renderTrackerResult();
    maybeCompleteHabit('reviewdata');
    toast('Data tracker updated.');
  };
}

function renderTrackerResult(){
  const box = $('#trackerResult');
  if(!box) return;
  const u = currentUser();
  const d = u.dataTracker;
  if(!d.allowanceGB || !d.usedGB){ box.innerHTML=''; return; }
  const allowance = parseFloat(d.allowanceGB);
  const used = parseFloat(d.usedGB);
  if(isNaN(allowance) || isNaN(used) || allowance<=0){
    box.innerHTML = `<div class="result-box warn"><div class="result-title">Please enter valid numbers</div></div>`;
    return;
  }
  const remaining = Math.max(0, allowance-used).toFixed(1);
  const pct = Math.min(100, Math.round((used/allowance)*100));
  let level='safe', msg='You are in a healthy range for this point in your billing cycle.';
  if(pct>=100){ level='danger'; msg='You have used all or more than your allowance. Consider connecting to Wi-Fi as much as possible until your plan resets.'; }
  else if(pct>=80){ level='warn'; msg='You are close to your limit. Try switching to Wi-Fi for streaming and downloads for the rest of this cycle.'; }

  let avgLine = '';
  if(d.resetDate){
    // Estimate cycle start as 30 days before the next reset date, then find
    // how many of those days have passed so far.
    const resetDateObj = new Date(d.resetDate);
    const cycleStart = new Date(resetDateObj);
    cycleStart.setDate(cycleStart.getDate() - 30);
    const daysSinceReset = Math.min(30, Math.max(1, daysBetween(cycleStart, new Date())));
    const daysLeft = Math.max(0, daysBetween(new Date(), resetDateObj));
    const avgPerDay = (used/daysSinceReset).toFixed(2);
    avgLine = `<p class="muted">Roughly ${avgPerDay} GB used per day so far this cycle (estimate)`
      + (daysLeft>0 ? `, with about ${daysLeft} day${daysLeft===1?'':'s'} left until reset.` : '.') + `</p>`;
  }

  box.innerHTML = `
    <div class="result-box ${level}">
      <div class="result-title">${pct}% of your data used</div>
      <progress value="${pct}" max="100"></progress>
      <p style="margin-top:10px;">${remaining} GB remaining out of ${allowance} GB.</p>
      <p>${msg}</p>
      ${avgLine}
    </div>`;
}

// ================= FEATURE D: HABITS & STREAKS =================
const HABITS = [
  {id:'learnterm', label:'Learn one new digital/job term', hint:'Visit Job Terms and mark one term as learned.'},
  {id:'checklink', label:'Check a suspicious link before opening it', hint:'Use the Scam Checker on any link or message.'},
  {id:'reviewdata', label:'Review your data usage', hint:'Update your numbers in the Data Tracker.'},
  {id:'safetytip', label:'Learn one online safety tip', hint:'Read a safety tip below and check it off.'},
  {id:'lesson', label:'Complete a digital literacy lesson', hint:'Read through one full glossary category.'},
];
const BADGES = [
  {id:'first_step', name:'First Step', need:h=>h.points>=1, emoji:''},
  {id:'three_day', name:'3-Day Streak', need:h=>h.streak>=3, emoji:''},
  {id:'week', name:'7-Day Streak', need:h=>h.streak>=7, emoji:''},
  {id:'point_25', name:'25 Points', need:h=>h.points>=25, emoji:''},
  {id:'allrounder', name:'All-Rounder', need:h=>{ const today=h.history.find(x=>x.date===todayStr()); return today && today.habitIds.length>=HABITS.length; }, emoji:''},
];

function maybeCompleteHabit(id){
  const u = currentUser();
  if(!u) return;
  const h = u.habits;
  const today = todayStr();
  if(h.lastCompletedDate[id] === today) return; // already rewarded today — prevents unlimited repeats
  h.lastCompletedDate[id] = today;
  h.points += 5;

  // streak logic
  if(h.lastActiveDate !== today){
    if(h.lastActiveDate && daysBetween(h.lastActiveDate, today)===1){ h.streak += 1; }
    else { h.streak = 1; }
    h.lastActiveDate = today;
    h.longestStreak = Math.max(h.longestStreak, h.streak);
  }

  let todayEntry = h.history.find(x=>x.date===today);
  if(!todayEntry){ todayEntry = {date:today, habitIds:[]}; h.history.push(todayEntry); }
  if(!todayEntry.habitIds.includes(id)) todayEntry.habitIds.push(id);

  saveUsers(users);
  if(currentTab==='habits'){ renderHabits($('#mainContent')); }
  toast('Nice work! +5 points');
}

function renderHabits(main){
  const u = currentUser();
  const h = u.habits;
  const today = todayStr();
  const todayEntry = h.history.find(x=>x.date===today) || {habitIds:[]};

  main.innerHTML = `
  <h1>Daily Habits &amp; Streaks</h1>
  <p class="muted">Small daily actions build big digital confidence. Complete today's checklist to keep your streak going.</p>

  <div class="card">
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">${h.streak}</div><div class="stat-label">Current streak</div></div>
      <div class="stat-box"><div class="stat-num">${h.longestStreak}</div><div class="stat-label">Longest streak</div></div>
      <div class="stat-box"><div class="stat-num">${h.points}</div><div class="stat-label">Total points</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Today's checklist</h2>
    <div id="habitChecklist"></div>
    <p class="muted" style="margin-top:10px;">Each habit can only be completed once per day — quality over quantity!</p>
  </div>

  <div class="card">
    <h2>Badges</h2>
    <div class="badge-grid" id="badgeGrid"></div>
  </div>
  `;

  const list = $('#habitChecklist');
  HABITS.forEach(hb=>{
    const done = todayEntry.habitIds.includes(hb.id);
    const row = document.createElement('div');
    row.className='habit-row';
    row.innerHTML = `
      <div>
        <label style="font-weight:700;display:flex;gap:10px;align-items:center;margin-bottom:2px;">
          <input type="checkbox" class="habit-check" ${done?'checked disabled':''} data-hid="${hb.id}">
          ${escapeHtml(hb.label)}
        </label>
        <div class="muted" style="font-size:.88rem;margin-left:36px;">${escapeHtml(hb.hint)}</div>
      </div>
    `;
    list.appendChild(row);
  });
  $$('.habit-check').forEach(cb=>{
    cb.onchange = ()=>{
      if(cb.checked) maybeCompleteHabit(cb.dataset.hid);
    };
  });

  const grid = $('#badgeGrid');
  BADGES.forEach(b=>{
    const earned = b.need(h);
    const el = document.createElement('div');
    el.className = 'badge-item'+(earned?' earned':'');
    el.innerHTML = `<div class="badge-name">${escapeHtml(b.name)}</div>`;
    grid.appendChild(el);
  });
}

// ================= ACCOUNT =================
function renderAccount(main){
  const u = currentUser();
  main.innerHTML = `
  <h1>Account &amp; Settings</h1>
  <div class="card">
    <h2>Your details</h2>
    <p><strong>Username:</strong> ${escapeHtml(u.username)}</p>
    <p><strong>Member since:</strong> ${new Date(u.createdAt).toLocaleDateString()}</p>
    <button class="btn secondary" id="logoutBtn2">Log out</button>
  </div>
  <div class="card">
    <h2>Danger zone</h2>
    <p class="muted">This will permanently delete your account and all saved progress from this browser.</p>
    <button class="btn" style="background:var(--danger);" id="deleteBtn">Delete my account</button>
  </div>
  <div class="card">
    <h2>Help Assistant settings</h2>
    <p class="muted">The chat bubble in the corner uses OpenRouter's free API. Your key (if you use one) is stored only in this browser.</p>
    <label for="acctKeyInput">OpenRouter API key</label>
    <input type="password" id="acctKeyInput" placeholder="sk-or-v1-..." value="${escapeAttr(getStoredKey())}">
    <label for="acctModelInput">Model ID (advanced, optional)</label>
    <input type="text" id="acctModelInput" placeholder="${escapeAttr(DEFAULT_ASSISTANT_MODEL)}" value="${escapeAttr(getStoredModel())}">
    <div class="field-hint">Free models rotate — check <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noopener">openrouter.ai/models</a> if the assistant stops responding.</div>
    <button class="btn" id="acctKeySave">Save assistant settings</button>
    <button class="btn ghost" id="acctKeyClear">Remove saved key</button>
  </div>
  <div class="card">
    <h2>About this prototype</h2>
    <p class="muted">DigitalEase is a learning prototype that runs entirely in your browser. Accounts, streaks, and data-tracker figures are saved only in this browser's local storage — they are not stored on a remote server or shared across devices. Passwords are hashed before saving, but this demo does not include a real backend, database, or production-grade session security. The Scam Checker uses a small bundled sample list and simple heuristics to stand in for live threat-intelligence feeds. The Help Assistant sends your chat messages directly to OpenRouter using the key you provide — see the README for details.</p>
  </div>
  `;
  $('#logoutBtn2').onclick = ()=>{ session=null; toast('Logged out.'); setTab('landing'); };
  $('#deleteBtn').onclick = ()=>{
    if(confirm('Are you sure you want to delete your account? This cannot be undone.')){
      delete users[u.username];
      saveUsers(users);
      session = null;
      toast('Account deleted.');
      setTab('landing');
    }
  };
  $('#acctKeySave').onclick = ()=>{
    setStoredKey($('#acctKeyInput').value.trim());
    setStoredModel($('#acctModelInput').value.trim());
    toast('Assistant settings saved.');
    renderChatWidget();
  };
  $('#acctKeyClear').onclick = ()=>{
    setStoredKey(''); setStoredModel('');
    $('#acctKeyInput').value=''; $('#acctModelInput').value='';
    toast('Saved key removed.');
    renderChatWidget();
  };
}

// ---------- helpers ----------
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str); }
window.setTab = setTab; // used by inline onclick handlers

render();

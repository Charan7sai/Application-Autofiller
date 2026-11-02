// End-to-end test: loads the real extension into Brave with a throwaway profile.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const BRAVE = process.env.BRAVE_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const ext = resolve('extension');
let passed = 0;
const failures = [];
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
};
const yes = (name, v) => eq(name, Boolean(v), true);

const handler = (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/vendor/react.js') return res.end(readFileSync('node_modules/react/umd/react.development.js'));
  if (url === '/vendor/react-dom.js') return res.end(readFileSync('node_modules/react-dom/umd/react-dom.development.js'));
  const file = join('test/pages', url);
  if (!existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('content-type', 'text/html');
  res.end(readFileSync(file));
};
const s1 = createServer(handler).listen(0);
await new Promise((r) => s1.once('listening', r));
const port = s1.address().port;
const s2 = createServer(handler).listen(port + 1);
await new Promise((r) => s2.once('listening', r));
const base = `http://localhost:${port}`;

const dir = mkdtempSync(join(tmpdir(), 'ra-test-'));
const ctx = await chromium.launchPersistentContext(dir, {
  executablePath: BRAVE,
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'],
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));
const id = new URL(sw.url()).host;

const errors = [];
const opts = await ctx.newPage();
opts.on('pageerror', (e) => errors.push(e.message));
opts.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await opts.goto(`chrome-extension://${id}/options.html`);

async function upload(file) {
  await opts.evaluate(() => chrome.storage.local.remove(['profile', 'resumeFile']));
  await opts.setInputFiles('#file', file);
  await opts.waitForFunction((n) => document.getElementById('dropTitle').textContent === n, file.split('/').pop(), { timeout: 20000 });
  return opts.evaluate(async () => (await chrome.storage.local.get('profile')).profile);
}
async function fill(url) {
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.bringToFront();
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u + '*' })).pop()?.id, url);
  const summary = await opts.evaluate((t) => chrome.runtime.sendMessage({ type: 'fill', tabId: t }), tabId);
  return { page, summary };
}

// ---------- Parsing ----------
let p = await upload('test/fixtures/one-column.pdf');
if (process.env.DUMP) console.log(JSON.stringify(p, null, 1));
eq('pdf1 name', [p.firstName, p.middleName, p.lastName], ['Priya', 'Anjali', 'Sharma']);
eq('pdf1 email', p.email, 'priya.sharma@example.com');
eq('pdf1 phone', [p.phone, p.phoneCountryCode, p.phoneNational], ['+91 98765 43210', '+91', '9876543210']);
eq('pdf1 location', [p.city, p.state, p.country, p.postalCode], ['Hyderabad', 'Telangana', 'India', '500032']);
eq('pdf1 linkedin from hidden link', p.linkedin, 'https://www.linkedin.com/in/priya-sharma-demo');
eq('pdf1 github', p.github, 'https://github.com/priyasharma-demo');
eq('pdf1 job count', p.experience.length, 2);
eq('pdf1 job0', [p.experience[0].title, p.experience[0].company, p.experience[0].startDate, p.experience[0].endDate, p.experience[0].current], ['Senior Software Engineer', 'Northwind Technologies Pvt Ltd', '2023-01', '', true]);
eq('pdf1 job0 location', p.experience[0].location, 'Bengaluru, Karnataka');
yes('pdf1 job0 bullets merged', /audit trails\nReduced checkout latency by 40 percent$/.test(p.experience[0].description));
eq('pdf1 job1', [p.experience[1].title, p.experience[1].company, p.experience[1].location, p.experience[1].startDate, p.experience[1].endDate], ['Software Engineer Intern', 'Contoso Labs', 'Remote', '2021-05', '2022-12']);
eq('pdf1 edu count', p.education.length, 2);
eq('pdf1 edu0', [p.education[0].school, p.education[0].degree, p.education[0].field, p.education[0].gpa, p.education[0].startDate, p.education[0].endDate], ['Indian Institute of Technology Hyderabad', 'B.Tech', 'Computer Science', '8.7/10', '2017', '2021']);
eq('pdf1 edu1', [p.education[1]?.school, p.education[1]?.degree, p.education[1]?.gpa], ['Narayana Junior College', 'Intermediate', '96%']);
eq('pdf1 skills', p.skills, ['Go', 'Python', 'Java', 'Docker', 'Kubernetes', 'Postgres']);
eq('pdf1 project', [p.projects[0]?.name, p.projects[0]?.url], ['Ledgerlite', 'https://github.com/priyasharma-demo/ledgerlite']);
eq('pdf1 cert', [p.certifications[0]?.name, p.certifications[0]?.issuer, p.certifications[0]?.date], ['AWS Solutions Architect', 'Amazon', '2024-03']);
eq('pdf1 languages', p.languages, ['English', 'Hindi', 'Telugu']);
eq('pdf1 summary', p.summary, 'Backend engineer with three years of experience building payment services at scale.');

// ---------- Filling ----------
let { page, summary } = await fill(`${base}/plain.html`);
const val = (sel) => page.locator(sel).inputValue();
eq('plain first', await val('#a'), 'Priya');
eq('plain last', await val('#b'), 'Sharma');
eq('plain email', await val('[name=applicant_email]'), 'priya.sharma@example.com');
eq('plain phone', await val('[name=tel]'), '+91 98765 43210');
eq('plain linkedin', await val('[name=li]'), p.linkedin);
eq('plain github', await val('[name=gh]'), p.github);
eq('plain city', await val('[name=c1]'), 'Hyderabad');
eq('plain state select', await val('[name=st]'), 'Telangana');
eq('plain country select', await val('[name=co]'), 'IN');
eq('plain trap: other question', await val('#target'), '');
eq('plain trap: availability', await val('#avail'), '');
eq('plain work company', await val('[name="work[0][company]"]'), 'Northwind Technologies Pvt Ltd');
eq('plain work title', await val('[name="work[0][title]"]'), 'Senior Software Engineer');
eq('plain work start', await val('[name="work[0][from]"]'), '01/2023');
eq('plain work end blank when current', await val('[name="work[0][to]"]'), '');
eq('plain work current ticked', await page.locator('[name="work[0][cur]"]').isChecked(), true);
yes('plain work description', (await val('[name="work[0][d]"]')).startsWith('Built a ledger'));
eq('plain school', await val('[name="ed[0][s]"]'), 'Indian Institute of Technology Hyderabad');
eq('plain degree select by level', await val('[name="ed[0][deg]"]'), "Bachelor's Degree");
eq('plain field', await val('[name="ed[0][f]"]'), 'Computer Science');
eq('plain gpa', await val('[name="ed[0][g]"]'), '8.7/10');
eq('plain year-only date stays empty on month input', await val('[name="ed[0][from]"]'), '');
eq('plain resume attached', await page.locator('[name=resume]').evaluate((e) => e.files[0]?.name), 'one-column.pdf');
eq('plain cover untouched', await page.locator('[name=cover]').evaluate((e) => e.files.length), 0);
eq('plain trap: emergency name', await val('#ec'), '');
eq('plain trap: emergency phone', await val('#ecp'), '');
eq('plain trap: gender', await val('#gender'), '');
eq('plain trap: dob', await val('#dob'), '');
eq('plain trap: honeypot', await val('#hp'), '');
eq('plain keeps existing value', await val('#pre'), 'Keep Me');
eq('plain never submits', await page.evaluate(() => window.submitted), 0);
eq('plain radio unanswered without opt-in', await page.locator('input[name=auth]:checked').count(), 0);
yes('plain reports gender for review', summary.review?.some((r) => /gender/i.test(r.label)));
eq('plain reports extra jobs', summary.extraSlots?.work, 1);
if (process.env.DUMP) console.log(JSON.stringify(summary, null, 1));
await page.close();

await opts.evaluate(async () => {
  const { profile } = await chrome.storage.local.get('profile');
  profile.extras.workAuthorized = 'Yes';
  await chrome.storage.local.set({ profile });
});
({ page, summary } = await fill(`${base}/plain.html`));
eq('radio answered from opt-in', await page.locator('input[name=auth]:checked').inputValue().catch(() => null), 'y');
await page.close();

({ page, summary } = await fill(`${base}/react.html`));
const state = await page.evaluate(() => window.state);
eq('react state first', state.first, 'Priya');
eq('react state last', state.last, 'Sharma');
eq('react state email', state.mail, 'priya.sharma@example.com');
yes('react state summary', state.sum?.startsWith('Backend engineer'));
eq('react combobox country', state.country, 'India');
eq('react combobox school not guessed', state.school, undefined);
yes('react school flagged', summary.review?.some((r) => /school/i.test(r.label)));
await page.close();

({ page, summary } = await fill(`${base}/embed.html`));
const frame = page.frames().find((f) => f.url().includes('frame.html'));
eq('iframe first', await frame.locator('[data-automation-id=legalNameSection_firstName]').inputValue(), 'Priya');
eq('iframe last', await frame.locator('[data-automation-id=legalNameSection_lastName]').inputValue(), 'Sharma');
eq('iframe email', await frame.locator('[data-automation-id=email]').inputValue(), 'priya.sharma@example.com');
eq('iframe job1', await frame.locator('[data-automation-id=jobTitle]').inputValue(), 'Senior Software Engineer');
eq('iframe job2', await frame.locator('[data-automation-id=jobTitle-2]').inputValue(), 'Software Engineer Intern');
eq('iframe company2', await frame.locator('[data-automation-id=company-2]').inputValue(), 'Contoso Labs');
eq('iframe month select', await frame.locator('#fm').inputValue(), '1');
eq('iframe year select', await frame.locator('#fy').inputValue(), '2023');
await page.close();

({ page, summary } = await fill(`${base}/login.html`));
eq('login form untouched', await page.locator('#le').inputValue(), '');
await page.close();

({ page, summary } = await fill(`${base}/lever-style.html`));
const lv = (sel) => page.locator(sel).inputValue();
eq('lever resume', await page.locator('[name=resume]').evaluate((e) => e.files[0]?.name), 'one-column.pdf');
eq('lever full name', await lv('[name=name]'), 'Priya Anjali Sharma');
eq('lever email', await lv('[name=email]'), 'priya.sharma@example.com');
eq('lever phone', await lv('[name=phone]'), '+91 98765 43210');
eq('lever location', await lv('[name=location]'), 'Hyderabad, Telangana, India');
eq('lever current company', await lv('[name=org]'), 'Northwind Technologies Pvt Ltd');
eq('lever linkedin', await lv('[name="urls[LinkedIn]"]'), 'https://www.linkedin.com/in/priya-sharma-demo');
eq('lever github', await lv('[name="urls[GitHub]"]'), 'https://github.com/priyasharma-demo');
eq('lever open question left', await lv('[name="cards[abc][field0]"]'), '');
eq('lever sponsorship left without opt-in', await lv('[name="cards[abc][field1]"]'), '');
eq('lever gender left', await lv('[name="eeo[gender]"]'), '');
eq('lever race left', await lv('[name="eeo[race]"]'), '');
eq('lever comments left', await lv('[name=comments]'), '');
await page.close();

({ page, summary } = await fill(`${base}/greenhouse-style.html`));
const gh = await page.evaluate(() => window.state);
if (process.env.DUMP) console.log(JSON.stringify({ gh, summary }, null, 1));
eq('gh first', gh.first_name, 'Priya');
eq('gh last', gh.last_name, 'Sharma');
eq('gh email', gh.email, 'priya.sharma@example.com');
eq('gh country from list', gh.country, 'India +91');
eq('gh phone', gh.phone, '+91 98765 43210');
eq('gh linkedin', gh.question_1, 'https://www.linkedin.com/in/priya-sharma-demo');
eq('gh work auth from opt-in', gh.question_3, 'Yes');
eq('gh resume', await page.locator('#resume').evaluate((e) => e.files[0]?.name), 'one-column.pdf');
eq('gh cover untouched', await page.locator('#cover_letter').evaluate((e) => e.files.length), 0);
eq('gh school', gh['school--0'], 'Indian Institute of Technology Hyderabad');
eq('gh degree', gh['degree--0'], "Bachelor's Degree");
eq('gh discipline', gh['discipline--0'], 'Computer Science');
eq('gh gender left', gh.gender, undefined);
eq('gh veteran left', gh.veteran_status, undefined);
if (process.env.SHOTS) await page.screenshot({ path: 'test/shots/filled.png', fullPage: true });
await page.close();

if (process.env.SHOTS) {
  await opts.setViewportSize({ width: 1000, height: 900 });
  await opts.reload();
  await opts.waitForSelector('#sections .card');
  await opts.screenshot({ path: 'test/shots/options.png' });
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 340, height: 170 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForTimeout(200);
  await pop.screenshot({ path: 'test/shots/popup.png' });
  await pop.close();
}

// ---------- Other files ----------
p = await upload('test/fixtures/two-column.pdf');
if (process.env.DUMP) console.log(JSON.stringify(p, null, 1));
eq('2col name', p.fullName, 'Daniel Okafor');
eq('2col email', p.email, 'daniel.okafor@example.org');
eq('2col phone', p.phoneNational, '4155550134');
eq('2col location', [p.city, p.state, p.country], ['Austin', 'TX', 'United States']);
eq('2col site', p.website, 'https://danielokafor.dev');
eq('2col jobs', p.experience.map((e) => [e.title, e.company, e.startDate, e.endDate]), [['Lead Designer', 'Fabrikam Inc', '2022-03', ''], ['Product Designer', 'Adventure Works LLC', '2019-06', '2022-02']]);
eq('2col bullets stay with job', p.experience[1]?.description, 'Shipped onboarding for two products\nRan weekly usability sessions');
eq('2col skills', p.skills, ['Figma', 'Prototyping', 'User Research', 'Design Systems', 'HTML', 'CSS', 'Accessibility']);
eq('2col languages', p.languages, ['English', 'Spanish']);
eq('2col edu', [p.education[0]?.school, p.education[0]?.degree, p.education[0]?.field, p.education[0]?.gpa, p.education[0]?.endDate], ['University of Texas at Austin', 'Bachelor of Fine Arts', 'Design', '3.8/4.0', '2019']);

p = await upload('test/fixtures/resume.docx');
if (process.env.DUMP) console.log(JSON.stringify(p, null, 1));
eq('docx name', p.fullName, 'Meera Nair');
eq('docx contact', [p.email, p.phoneCountryCode, p.phoneNational, p.city, p.state, p.country], ['meera.nair@example.net', '+91', '9000012345', 'Kochi', 'Kerala', 'India']);
eq('docx linkedin from hidden link', p.linkedin, 'https://linkedin.com/in/meera-nair-demo');
eq('docx job', [p.experience[0]?.title, p.experience[0]?.company, p.experience[0]?.startDate, p.experience[0]?.current, p.experience[0]?.description], ['Data Analyst', 'Tailspin Toys Ltd', '2022-08', true, 'Built weekly revenue dashboards']);
eq('docx edu', [p.education[0]?.school, p.education[0]?.degree, p.education[0]?.field, p.education[0]?.endDate], ['University of Kerala', 'M.Sc.', 'Statistics', '2022']);
eq('docx skills', p.skills, ['SQL', 'Python', 'Tableau']);

// ---------- AI path against a stubbed API: no real key, no network call ----------
let sent = null;
await ctx.route('https://api.anthropic.com/**', async (route) => {
  sent = { headers: route.request().headers(), body: route.request().postDataJSON() };
  const out = {
    firstName: 'Priya', middleName: '', lastName: 'Sharma', fullName: 'Priya Sharma', email: 'made.up@wrong.example',
    phone: '+91 98765 43210', phoneCountryCode: '+91', phoneNational: '9876543210', address: '', city: 'Hyderabad', state: '',
    postalCode: '', country: 'India', linkedin: '', github: '', website: '', headline: 'AI Headline', summary: '', skills: ['Go'],
    languages: [], experience: [], education: [], projects: [], certifications: [],
  };
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
  });
});
await opts.evaluate(() => chrome.storage.local.set({ aiOn: true, aiKey: 'test-placeholder' }));
await opts.reload();
p = await upload('test/fixtures/one-column.pdf');
yes('ai called', sent);
if (sent) {
  eq('ai model', sent.body.model, 'claude-opus-5-5');
  eq('ai fallback', [sent.body.fallbacks, sent.headers['anthropic-beta']], ['default', 'server-side-fallback-2026-07-01']);
  eq('ai sends pdf', sent.body.messages[0].content[0].source?.media_type, 'application/pdf');
  yes('ai schema', sent.body.output_config?.format?.schema?.properties?.experience);
}
eq('ai value used', p.headline, 'AI Headline');
eq('ai invented email rejected', p.email, 'priya.sharma@example.com');
eq('ai links fall back to file', p.linkedin, 'https://www.linkedin.com/in/priya-sharma-demo');

eq('no page errors', errors, []);
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
await ctx.close();
s1.close();
s2.close();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {}
process.exit(failures.length ? 1 : 0);

import { extractResume } from './lib/text-extract.js';
import { parseResume, emptyProfile } from './lib/resume-parser.js';

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;

let profile = null;
let saveTimer = null;

const YES_NO = ['', 'Yes', 'No'];

const SIMPLE_SECTIONS = [
  {
    title: 'About you',
    fields: [
      ['firstName', 'First name'], ['lastName', 'Last name'],
      ['middleName', 'Middle name'], ['fullName', 'Full name'],
      ['email', 'Email'], ['phone', 'Phone (as written)'],
      ['phoneCountryCode', 'Country code'], ['phoneNational', 'Phone without code'],
    ],
  },
  {
    title: 'Where you live',
    fields: [
      ['address', 'Street address', 'wide'],
      ['city', 'City'], ['state', 'State'],
      ['postalCode', 'Postal code'], ['country', 'Country'],
    ],
  },
  {
    title: 'Links',
    fields: [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['website', 'Website or portfolio', 'wide']],
  },
  {
    title: 'Profile',
    fields: [['headline', 'Headline', 'wide'], ['summary', 'Summary', 'wide area']],
  },
];

const LISTS = [
  {
    key: 'experience', title: 'Work experience', noun: 'job',
    blank: { title: '', company: '', location: '', startDate: '', endDate: '', current: false, description: '' },
    fields: [
      ['title', 'Job title'], ['company', 'Company'], ['location', 'Location', 'wide'],
      ['startDate', 'Start (YYYY-MM)'], ['endDate', 'End (YYYY-MM)'],
      ['current', 'I still work here', 'check'], ['description', 'Description', 'wide area'],
    ],
  },
  {
    key: 'education', title: 'Education', noun: 'school',
    blank: { school: '', degree: '', field: '', gpa: '', location: '', startDate: '', endDate: '' },
    fields: [
      ['school', 'School', 'wide'], ['degree', 'Degree'], ['field', 'Field of study'],
      ['gpa', 'GPA or percentage'], ['location', 'Location'],
      ['startDate', 'Start (YYYY-MM)'], ['endDate', 'End (YYYY-MM)'],
    ],
  },
  {
    key: 'projects', title: 'Projects', noun: 'project',
    blank: { name: '', url: '', description: '' },
    fields: [['name', 'Name'], ['url', 'Link'], ['description', 'Description', 'wide area']],
  },
  {
    key: 'certifications', title: 'Certifications', noun: 'certification',
    blank: { name: '', issuer: '', date: '' },
    fields: [['name', 'Name', 'wide'], ['issuer', 'Issuer'], ['date', 'Date (YYYY-MM)']],
  },
];

// ---------- Saving ----------

function queueSave() {
  clearTimeout(saveTimer);
  $('saved').textContent = '';
  saveTimer = setTimeout(async () => {
    await store.set({ profile });
    $('saved').textContent = 'Saved';
  }, 250);
}

// ---------- Form building ----------

function textField(labelText, value, className, onInput) {
  const wrap = document.createElement('label');
  wrap.className = `field ${className.includes('wide') ? 'wide' : ''}`;
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const input = document.createElement(className.includes('area') ? 'textarea' : 'input');
  if (input.tagName === 'INPUT') input.type = 'text';
  input.value = value || '';
  input.spellcheck = false;
  const mark = () => input.classList.toggle('missing', !input.value.trim());
  mark();
  input.addEventListener('input', () => {
    mark();
    onInput(input.value);
    queueSave();
  });
  wrap.append(caption, input);
  return wrap;
}

function section(title) {
  const card = document.createElement('section');
  card.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.append(heading);
  return card;
}

function buildSimple(def) {
  const card = section(def.title);
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const [key, label, cls = ''] of def.fields) {
    grid.append(textField(label, profile[key], cls, (v) => { profile[key] = v; }));
  }
  card.append(grid);
  return card;
}

function buildCommaList(key, title, label) {
  const card = section(title);
  const value = (profile[key] || []).join(', ');
  card.append(textField(label, value, 'wide area', (v) => {
    profile[key] = v.split(',').map((s) => s.trim()).filter(Boolean);
  }));
  return card;
}

function buildList(def) {
  const card = section(def.title);
  const holder = document.createElement('div');
  card.append(holder);

  const draw = () => {
    holder.replaceChildren();
    profile[def.key].forEach((entry, index) => {
      const box = document.createElement('div');
      box.className = 'entry';
      const head = document.createElement('div');
      head.className = 'entry-head';
      const name = document.createElement('span');
      name.textContent = `${def.noun[0].toUpperCase()}${def.noun.slice(1)} ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        profile[def.key].splice(index, 1);
        draw();
        queueSave();
      });
      head.append(name, remove);

      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const [key, label, cls = ''] of def.fields) {
        if (cls === 'check') {
          const wrap = document.createElement('label');
          wrap.className = 'check field wide';
          wrap.style.flexDirection = 'row';
          const box2 = document.createElement('input');
          box2.type = 'checkbox';
          box2.checked = Boolean(entry[key]);
          box2.addEventListener('change', () => {
            entry[key] = box2.checked;
            queueSave();
          });
          wrap.append(box2, document.createTextNode(label));
          grid.append(wrap);
        } else {
          grid.append(textField(label, entry[key], cls, (v) => { entry[key] = v; }));
        }
      }
      box.append(head, grid);
      holder.append(box);
    });
  };
  draw();

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'link';
  add.textContent = `Add ${def.noun}`;
  add.addEventListener('click', () => {
    profile[def.key].push({ ...def.blank });
    draw();
    queueSave();
  });
  card.append(add);
  return card;
}

function selectField(label, key) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  for (const value of YES_NO) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value || 'Leave for me';
    select.append(option);
  }
  select.value = profile.extras[key] || '';
  select.addEventListener('change', () => {
    profile.extras[key] = select.value;
    queueSave();
  });
  wrap.append(caption, select);
  return wrap;
}

function buildExtras() {
  const card = section('Common questions that are not on a resume');
  const note = document.createElement('p');
  note.className = 'tip';
  note.style.margin = '-6px 0 12px';
  note.textContent = 'Only answered if you fill these in. Questions about gender, race, disability, date of birth and ID numbers are always left for you.';
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(
    selectField('Authorized to work?', 'workAuthorized'),
    selectField('Need visa sponsorship?', 'needsSponsorship'),
    selectField('Willing to relocate?', 'willingToRelocate'),
  );
  for (const [key, label] of [
    ['yearsExperience', 'Total years of experience'],
    ['noticePeriod', 'Notice period'],
    ['expectedSalary', 'Expected salary'],
    ['currentSalary', 'Current salary'],
  ]) {
    const field = textField(label, profile.extras[key], '', (v) => { profile.extras[key] = v; });
    field.querySelector('input').classList.remove('missing');
    field.querySelector('input').addEventListener('input', (e) => e.target.classList.remove('missing'));
    grid.append(field);
  }
  card.append(note, grid);
  return card;
}

function render() {
  const holder = $('sections');
  holder.replaceChildren();
  for (const def of SIMPLE_SECTIONS) holder.append(buildSimple(def));
  holder.append(buildCommaList('skills', 'Skills', 'Separate with commas'));
  for (const def of LISTS) holder.append(buildList(def));
  holder.append(buildCommaList('languages', 'Languages', 'Separate with commas'));
  holder.append(buildExtras());
  $('form').hidden = false;
}

// ---------- Upload ----------

function showMessage(text, info = false) {
  $('message').hidden = !text;
  $('message').textContent = text || '';
  $('message').classList.toggle('info', info);
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function emailsAndPhones(text) {
  return text.toLowerCase().replace(/[^a-z0-9@.+]/g, '');
}

// Contact details decide whether a recruiter can reach you, so a value the file
// does not literally contain is replaced with the offline reading.
function mergeAI(ai, local, text) {
  const merged = { ...emptyProfile(), ...ai, extras: emptyProfile().extras };
  const haystack = emailsAndPhones(text);
  if (haystack) {
    if (!haystack.includes(String(ai.email).toLowerCase())) merged.email = local.email;
    if (!haystack.includes(emailsAndPhones(String(ai.phone)))) {
      merged.phone = local.phone;
      merged.phoneCountryCode = local.phoneCountryCode;
      merged.phoneNational = local.phoneNational;
    }
  }
  for (const key of ['linkedin', 'github', 'website']) merged[key] = ai[key] || local[key];
  return merged;
}

async function handleFile(file) {
  showMessage('');
  $('dropTitle').textContent = 'Reading your resume…';
  $('dropHint').textContent = file.name;
  try {
    const { aiOn, aiKey } = await store.get(['aiOn', 'aiKey']);
    const useAI = Boolean(aiOn && aiKey);

    let extracted = { text: '', links: [] };
    try {
      extracted = await extractResume(file);
    } catch (error) {
      if (!useAI || !file.name.toLowerCase().endsWith('.pdf')) throw error;
    }

    const local = parseResume(extracted.text, extracted.links);
    const hasText = extracted.text.replace(/\s/g, '').length >= 50;
    let next = local;

    if (useAI) {
      try {
        const { parseWithAI } = await import('./lib/ai-parser.js');
        const ai = await parseWithAI({ apiKey: aiKey, file, text: extracted.text });
        next = mergeAI(ai, local, extracted.text);
      } catch (error) {
        if (!hasText) throw error;
        showMessage(`AI reading failed, so the offline reading is shown instead. ${error.message}`);
      }
    } else if (!hasText) {
      throw new Error('This file has no readable text, so it is probably a scan. Upload a text-based PDF, or turn on the AI option below, which can read scans.');
    }

    // Keep answers the user already typed when replacing the resume.
    const previous = (await store.get('profile')).profile;
    if (previous?.extras) next.extras = previous.extras;

    profile = next;
    const buffer = await file.arrayBuffer();
    await store.set({
      profile,
      resumeFile: { name: file.name, type: file.type || 'application/octet-stream', base64: toBase64(buffer) },
    });
    render();
    showDropState(file.name);
    $('saved').textContent = 'Saved';
  } catch (error) {
    const { resumeFile } = await store.get('resumeFile');
    showDropState(resumeFile?.name);
    showMessage(error.message);
  }
}

function showDropState(name) {
  $('dropTitle').textContent = name || 'Upload your resume';
  $('dropHint').textContent = name ? 'Click or drop a file to replace it.' : 'PDF, DOCX or TXT. Click or drop it here.';
}

$('file').addEventListener('change', (e) => {
  const [file] = e.target.files;
  if (file) handleFile(file);
  e.target.value = '';
});

const drop = $('drop');
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.remove('over');
  });
}
drop.addEventListener('drop', (e) => {
  const [file] = e.dataTransfer.files;
  if (file) handleFile(file);
});

// ---------- AI settings and delete ----------

$('aiOn').addEventListener('change', (e) => store.set({ aiOn: e.target.checked }));
$('aiKey').addEventListener('input', (e) => store.set({ aiKey: e.target.value.trim() }));

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete your stored resume and all details from this browser?')) return;
  await store.remove(['profile', 'resumeFile']);
  profile = null;
  $('form').hidden = true;
  $('saved').textContent = '';
  showDropState();
});

// ---------- Start ----------

const saved = await store.get(['profile', 'resumeFile', 'aiOn', 'aiKey']);
$('aiOn').checked = Boolean(saved.aiOn);
$('aiKey').value = saved.aiKey || '';
if (saved.profile) {
  profile = { ...emptyProfile(), ...saved.profile };
  render();
  showDropState(saved.resumeFile?.name);
}

// Offline resume parser: plain text in, structured profile out.
// Leaves a field empty rather than guessing when the text does not support a value.

export function emptyProfile() {
  return {
    firstName: '', middleName: '', lastName: '', fullName: '',
    email: '', phone: '', phoneCountryCode: '', phoneNational: '',
    address: '', city: '', state: '', postalCode: '', country: '',
    linkedin: '', github: '', website: '',
    headline: '', summary: '',
    skills: [], languages: [],
    experience: [], education: [], projects: [], certifications: [],
    extras: {
      yearsExperience: '', workAuthorized: '', needsSponsorship: '', willingToRelocate: '',
      noticePeriod: '', expectedSalary: '', currentSalary: '',
    },
  };
}

const SECTIONS = {
  summary: ['summary', 'professional summary', 'career summary', 'executive summary', 'profile', 'professional profile', 'objective', 'career objective', 'about', 'about me'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history', 'relevant experience', 'internships', 'internship', 'internship experience', 'work and internship experience'],
  education: ['education', 'academic background', 'academics', 'educational background', 'educational qualifications', 'academic qualifications', 'education and training', 'academic details'],
  skills: ['skills', 'technical skills', 'key skills', 'core skills', 'core competencies', 'technologies', 'tech stack', 'technical proficiencies', 'technical expertise', 'skills and tools', 'skills and technologies', 'tools and technologies', 'areas of expertise', 'skill set', 'skillset'],
  projects: ['projects', 'personal projects', 'academic projects', 'key projects', 'selected projects', 'project experience', 'notable projects'],
  certifications: ['certifications', 'certification', 'licenses and certifications', 'certificates', 'courses and certifications', 'certifications and courses', 'professional certifications'],
  languages: ['languages', 'languages known', 'spoken languages'],
  other: ['awards', 'honors', 'honors and awards', 'awards and honors', 'achievements', 'accomplishments', 'publications', 'research', 'volunteer', 'volunteering', 'volunteer experience', 'interests', 'hobbies', 'hobbies and interests', 'references', 'activities', 'extracurricular activities', 'extracurriculars', 'extra curricular activities', 'positions of responsibility', 'leadership', 'coursework', 'relevant coursework', 'declaration', 'personal details', 'personal information', 'additional information'],
  contact: ['contact', 'contact information', 'contact details', 'personal details', 'personal information', 'get in touch'],
};

const HEADING_LOOKUP = new Map();
for (const [section, names] of Object.entries(SECTIONS)) {
  for (const name of names) HEADING_LOOKUP.set(name, section);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = `(?:${MONTH}\\.?,?\\s*(?:\\d{4}|'\\d{2})|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|(?:19|20)\\d{2})`;
const OPEN_END = 'present|current|now|ongoing|till date|to date|today';
const RANGE_RE = new RegExp(`(${DATE}|${MONTH}\\.?)\\s*(?:-|–|—|−|to|until|till)\\s*(${DATE}|${OPEN_END})`, 'i');
const SINGLE_DATE_RE = new RegExp(`(?:expected\\s+|graduat\\w+\\s+|class of\\s+)?(${DATE})`, 'i');

const TITLE_WORDS = /\b(engineer|developer|programmer|intern|internship|analyst|manager|consultant|designer|architect|scientist|lead|director|administrator|specialist|associate|coordinator|officer|assistant|researcher|technician|executive|trainee|fellow|head|president|founder|co-?founder|sde|sre|devops|tester|accountant|recruiter|teacher|tutor|instructor|professor|writer|editor|representative|supervisor|strategist|freelancer)\b/i;
const COMPANY_WORDS = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|gmbh|plc|co|company|technologies|technology|solutions|labs|systems|software|services|consulting|consultancy|group|industries|enterprises|bank|university|institute|college|studios|networks|global|ventures|partners|holdings|foundation|hospital)\b\.?/i;
const SCHOOL_WORDS = /\b(university|universit[àa]|college|institute|school|academy|polytechnic|vidyalaya|vidyapeeth|iit|nit|iiit|bits|mit)\b/i;
const DEGREE_RE = new RegExp(
  [
    "(?:bachelor|master)(?:['’]?s)?(?:\\s+(?:of|in)\\s+[a-z&]+(?:\\s+[a-z&]+)?)?",
    'doctor(?:ate)?(?:\\s+of\\s+[a-z]+)?',
    'associate(?:[\'’]?s)?\\s+(?:degree|of\\s+[a-z]+(?:\\s+[a-z]+)?)',
    'post\\s?graduate\\s+diploma',
    'diploma',
    'higher\\s+secondary(?:\\s+education)?',
    'senior\\s+secondary(?:\\s+education)?',
    'secondary\\s+(?:school|education)',
    'intermediate',
  ].join('|'),
  'i'
);
const DEGREE_ABBR_RE = /(?<![A-Za-z.])(B\.?\s?Tech\.?|M\.?\s?Tech\.?|B\.?\s?E\.?|M\.?\s?E\.?|B\.?\s?Sc\.?|M\.?\s?Sc\.?|B\.?S\.?|M\.?S\.?|BCA|MCA|BBA|MBA|B\.?\s?Com\.?|M\.?\s?Com\.?|B\.?A\.?|M\.?A\.?|Ph\.?\s?D\.?|SSC|HSC|CBSE|ICSE|Class\s+(?:XII|X|10|12)|12th|10th)(?![A-Za-z])/;
const GPA_RE = /(?:c?gpa|percentage|percent|score|marks|grade)\s*[:\-–]?\s*(\d{1,3}(?:\.\d+)?\s*(?:\/\s*\d{1,3}(?:\.\d+)?|%)?)|(\d{1,2}(?:\.\d+)?\s*\/\s*(?:10|4)(?:\.0+)?)\s*(?:c?gpa)?|(\d{2,3}(?:\.\d+)?\s*%)/i;
const LOCATION_PART_RE = /^(?:[Rr]emote|REMOTE|[Hh]ybrid|[Oo]n-?[Ss]ite|[Ww]ork [Ff]rom [Hh]ome|[A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*,\s*[A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*(?:,\s*[A-Z][A-Za-z. ]+)?)$/;

const isLocationPart = (part) => LOCATION_PART_RE.test(part) && !TITLE_WORDS.test(part) && !COMPANY_WORDS.test(part);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE_RE = /(?<![\w/.])(\+?\d{1,3}[\s.-]?)?(\(?\d{2,5}\)?[\s.-]?)(\d{2,5}[\s.-]?){1,3}\d{1,5}(?![\w/])/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s|,;()<>]+|(?:linkedin\.com|github\.com)\/[^\s|,;()<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|dev|io|me|org|net|in|ai|app|co|tech|xyz|site|page)(?:\/[^\s|,;()<>]*)?(?![a-z0-9@.-])/gi;
const BULLET_RE = /^\s*[•●○◦▪▫■□◆◇►▶➢➤✓✔·∙⁃*‣-]\s+|^\s*[•●○◦▪▫■□◆◇►▶➢➤✓✔·∙⁃‣]/;

const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const INDIAN_STATES = new Set(['andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'delhi', 'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal']);
const COUNTRIES = new Map(Object.entries({
  india: 'India', usa: 'United States', us: 'United States', 'united states': 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', 'united kingdom': 'United Kingdom', england: 'United Kingdom', canada: 'Canada', australia: 'Australia',
  germany: 'Germany', france: 'France', singapore: 'Singapore', uae: 'United Arab Emirates', 'united arab emirates': 'United Arab Emirates',
  ireland: 'Ireland', netherlands: 'Netherlands', 'new zealand': 'New Zealand', japan: 'Japan', china: 'China', nepal: 'Nepal',
  bangladesh: 'Bangladesh', 'sri lanka': 'Sri Lanka', pakistan: 'Pakistan', spain: 'Spain', italy: 'Italy', sweden: 'Sweden', switzerland: 'Switzerland',
}));

// ---------- Entry point ----------

export function parseResume(rawText, links = []) {
  const profile = emptyProfile();
  const lines = rawText
    .normalize('NFKC')
    .replace(/ /g, ' ')
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  const { header, sections } = splitSections(lines);

  parseContact(profile, [...header, ...(sections.contact || [])], lines, links);
  if (sections.summary) profile.summary = joinWrapped(sections.summary);
  if (sections.experience) profile.experience = parseExperience(sections.experience);
  if (sections.education) profile.education = parseEducation(sections.education);
  if (sections.skills) profile.skills = splitList(sections.skills);
  if (sections.languages) profile.languages = splitList(sections.languages);
  if (sections.projects) profile.projects = parseProjects(sections.projects, links);
  if (sections.certifications) profile.certifications = parseCertifications(sections.certifications);
  if (!profile.headline && profile.experience[0]) profile.headline = profile.experience[0].title;
  return profile;
}

// ---------- Sections ----------

function headingOf(line) {
  if (line.length > 45 || BULLET_RE.test(line)) return null;
  let text = line;
  if (/^(?:[A-Za-z] ){2,}[A-Za-z]$/.test(text)) text = text.replace(/ /g, '');
  if (/^(?:[A-Za-z] )+[A-Za-z](?: {1,}(?:[A-Za-z] )+[A-Za-z])+$/.test(line)) text = line.replace(/ /g, '');
  const key = text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return HEADING_LOOKUP.get(key) || null;
}

function splitSections(lines) {
  const header = [];
  const sections = {};
  let current = null;
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      sections[current] = sections[current] || [];
    } else if (current) {
      sections[current].push(line);
    } else {
      header.push(line);
    }
  }
  return { header, sections };
}

// ---------- Contact block ----------

function parseContact(profile, header, allLines, links) {
  const headerText = header.join('\n');
  const allText = allLines.join('\n');

  profile.email = (headerText.match(EMAIL_RE) || allText.match(EMAIL_RE) || [''])[0];
  const phone = findPhone(headerText) || findPhone(allText);
  if (phone) Object.assign(profile, phone);

  const urls = [...links];
  for (const source of [headerText, allText]) {
    const withoutEmails = source.replace(new RegExp(EMAIL_RE.source, 'g'), ' ');
    urls.push(...(withoutEmails.match(URL_RE) || []));
  }
  for (const raw of urls) {
    const url = cleanUrl(raw);
    if (!url) continue;
    if (/linkedin\.com\/in\//i.test(url)) profile.linkedin = profile.linkedin || url;
    else if (/github\.com\/[^/]+\/?$/i.test(url)) profile.github = profile.github || url;
  }
  const headerUrls = [...links.slice(0, 5), ...(headerText.replace(new RegExp(EMAIL_RE.source, 'g'), ' ').match(URL_RE) || [])];
  for (const raw of headerUrls) {
    const url = cleanUrl(raw);
    if (url && !/linkedin\.com|github\.com|mailto:|tel:|leetcode|hackerrank|codechef|codeforces|geeksforgeeks|twitter\.com|x\.com|facebook|instagram|medium\.com/i.test(url)) {
      profile.website = url;
      break;
    }
  }
  if (!profile.github) {
    const repo = urls.map(cleanUrl).find((u) => u && /github\.com\/[^/]+/i.test(u));
    if (repo) profile.github = repo.match(/https:\/\/github\.com\/[^/]+/i)[0];
  }

  // Everything in the header that is left after removing contact details.
  const segments = [];
  for (const line of header) {
    for (const part of line.split(/\s*[|•·◦∙●⋄]\s*|\s{2,}|\s[–—-]\s/)) {
      const clean = part
        .replace(new RegExp(EMAIL_RE.source, 'g'), '')
        .replace(URL_RE, '')
        .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 10 ? '' : m))
        .replace(/^(?:e-?mail|phone|mobile|tel|cell|linkedin|github|portfolio|website|address|location|contact)\s*[:.]?\s*/i, '')
        .replace(/^[\s,:;-]+|[\s,:;-]+$/g, '');
      if (clean) segments.push(clean);
    }
  }

  const nameIndex = segments.findIndex(looksLikeName);
  if (nameIndex >= 0) {
    setName(profile, segments[nameIndex]);
    segments.splice(nameIndex, 1);
  }
  for (const segment of segments) {
    if (!profile.city && parseLocation(profile, segment)) continue;
    if (!profile.headline && TITLE_WORDS.test(segment) && segment.length < 70) profile.headline = segment;
  }
}

function findPhone(text) {
  for (const match of text.matchAll(PHONE_RE)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) continue;
    if (/^(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}$/.test(raw)) continue;
    let code = '';
    let national = digits;
    if (raw.startsWith('+')) {
      const spaced = raw.match(/^\+(\d{1,3})[\s.(-]/);
      if (spaced) code = spaced[1];
      else if (digits.length > 10) code = digits.slice(0, digits.length - 10);
      if (code) national = digits.slice(code.length);
    } else if (digits.length === 12 && digits.startsWith('91')) {
      code = '91';
      national = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      national = digits.slice(1);
    }
    return { phone: raw, phoneCountryCode: code ? `+${code}` : '', phoneNational: national };
  }
  return null;
}

function cleanUrl(raw) {
  if (!raw || /^(?:mailto|tel):/i.test(raw)) return '';
  const url = raw.replace(/[.,;:)\]]+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^www\./i, 'www.')}`;
}

function looksLikeName(text) {
  if (/[\d@/\\:]/.test(text) || text.length > 50) return false;
  if (TITLE_WORDS.test(text) || COMPANY_WORDS.test(text) || HEADING_LOOKUP.has(text.toLowerCase())) return false;
  if (text.includes(',')) return false;
  if (/^(?:curriculum vitae|resume|résumé|cv)$/i.test(text)) return false;
  const words = text.split(/\s+/);
  return words.length >= 2 && words.length <= 6 && words.every((w) => /^[\p{L}][\p{L}.'’-]*$/u.test(w));
}

function setName(profile, raw) {
  const name = raw === raw.toUpperCase() ? toTitleCase(raw) : raw;
  const words = name.split(/\s+/);
  profile.fullName = name;
  profile.firstName = words[0];
  profile.lastName = words[words.length - 1];
  profile.middleName = words.slice(1, -1).join(' ');
}

function toTitleCase(text) {
  return text.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

function parseLocation(profile, text) {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  if (!parts.every((p) => /^[\p{L}\d .'-]+$/u.test(p))) return false;

  const pin = parts[parts.length - 1].match(/\b(\d{5,6})\b/);
  if (pin) {
    profile.postalCode = pin[1];
    const rest = parts[parts.length - 1].replace(pin[1], '').trim();
    if (rest) parts[parts.length - 1] = rest;
    else parts.pop();
  }
  const last = parts[parts.length - 1].toLowerCase();
  if (COUNTRIES.has(last)) {
    profile.country = COUNTRIES.get(last);
    parts.pop();
  }
  if (!parts.length) return false;
  const stateCandidate = parts.length > 1 ? parts[parts.length - 1] : '';
  if (stateCandidate) {
    profile.state = stateCandidate;
    parts.pop();
    if (!profile.country) {
      if (US_STATES.has(stateCandidate.toUpperCase())) profile.country = 'United States';
      else if (INDIAN_STATES.has(stateCandidate.toLowerCase())) profile.country = 'India';
    }
  }
  profile.city = parts[parts.length - 1];
  if (parts.length > 1) profile.address = parts.slice(0, -1).join(', ');
  return true;
}

// ---------- Dates ----------

function normalizeDate(text) {
  if (!text) return '';
  const value = text.trim().toLowerCase();
  const month = value.match(new RegExp(`^(${MONTH})\\.?,?\\s*(\\d{4}|'\\d{2})$`, 'i'));
  if (month) {
    const year = month[2].startsWith("'") ? `20${month[2].slice(1)}` : month[2];
    return `${year}-${String(MONTHS.indexOf(month[1].slice(0, 3)) + 1).padStart(2, '0')}`;
  }
  let m = value.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = value.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = value.match(/^(?:19|20)\d{2}$/);
  return m ? m[0] : '';
}

// Returns { start, end, current, rest } with the date text removed from the line.
function extractDates(line) {
  const match = line.match(RANGE_RE);
  if (!match) return null;
  let startRaw = match[1];
  const endRaw = match[2];
  const current = new RegExp(`^(?:${OPEN_END})$`, 'i').test(endRaw.trim());
  if (new RegExp(`^${MONTH}\\.?$`, 'i').test(startRaw.trim())) {
    const year = endRaw.match(/\d{4}/);
    if (!year) return null;
    startRaw = `${startRaw.replace('.', '')} ${year[0]}`;
  }
  return {
    start: normalizeDate(startRaw),
    end: current ? '' : normalizeDate(endRaw),
    current,
    rest: cleanParts(line.replace(match[0], ' ')),
  };
}

function cleanParts(text) {
  return text.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s|,:;•·–—-]+|[\s|,:;•·–—-]+$/g, '');
}

// ---------- Experience ----------

function stripBullet(line) {
  return line.replace(BULLET_RE, '').trim();
}

function isBodyLine(line) {
  return BULLET_RE.test(line) || line.length > 110 || (line.length > 60 && /[.;]$/.test(line));
}

function splitHeaderParts(text) {
  const parts = text.split(/\s*[|•·∙]\s*|\s+[–—-]\s+|\s+@\s+|\s+at\s+(?=[A-Z])/).map((p) => p.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (isLocationPart(part) || !part.includes(',')) {
      result.push(part);
      continue;
    }
    // "Software Engineer, Acme Inc" is two facts; "Acme, Inc" is one.
    const comma = part.indexOf(',');
    const before = part.slice(0, comma).trim();
    const after = part.slice(comma + 1).trim();
    if (TITLE_WORDS.test(before) && !/^(?:inc|llc|ltd|limited|corp|co)\b/i.test(after)) result.push(before, after);
    else result.push(part);
  }
  return result;
}

function assignHeader(entry, parts) {
  const remaining = [];
  for (const part of parts) {
    if (!entry.location && isLocationPart(part)) entry.location = part;
    else remaining.push(part);
  }
  const titleIndex = remaining.findIndex((p) => TITLE_WORDS.test(p) && !COMPANY_WORDS.test(p));
  const fallbackTitle = titleIndex < 0 ? remaining.findIndex((p) => TITLE_WORDS.test(p)) : titleIndex;
  if (fallbackTitle >= 0) entry.title = remaining.splice(fallbackTitle, 1)[0];
  const companyIndex = remaining.findIndex((p) => COMPANY_WORDS.test(p));
  if (companyIndex >= 0) entry.company = remaining.splice(companyIndex, 1)[0];
  if (!entry.title && remaining.length > 1) entry.title = remaining.shift();
  if (!entry.company && remaining.length) entry.company = remaining.shift();
}

function parseExperience(lines) {
  const entries = [];
  const dateLines = [];
  lines.forEach((line, i) => {
    if (!BULLET_RE.test(line) && line.length < 120 && RANGE_RE.test(line)) dateLines.push(i);
  });

  dateLines.forEach((dateIndex, n) => {
    const dates = extractDates(lines[dateIndex]);
    if (!dates) return;
    const entry = { title: '', company: '', location: '', startDate: dates.start, endDate: dates.end, current: dates.current, description: '' };
    const parts = dates.rest ? splitHeaderParts(dates.rest) : [];

    const lowerBound = n > 0 ? dateLines[n - 1] : -1;
    const before = [];
    for (let i = dateIndex - 1; i > lowerBound && before.length < 2; i--) {
      if (isHeaderCandidate(lines, i)) before.unshift(lines[i]);
      else break;
    }
    // A previous entry's body may end right above; headers sit only after the last bullet.
    const usedBefore = before.flatMap(splitHeaderParts);

    let bodyStart = dateIndex + 1;
    const nextDate = n + 1 < dateLines.length ? dateLines[n + 1] : lines.length;
    const known = [...usedBefore, ...parts].filter((p) => !isLocationPart(p)).length;
    const after = [];
    if (known < 2) {
      while (bodyStart < nextDate && after.length < 2 - known && !isBodyLine(lines[bodyStart])) {
        after.push(lines[bodyStart]);
        bodyStart++;
      }
    }
    assignHeader(entry, [...usedBefore, ...parts, ...after.flatMap(splitHeaderParts)]);

    let bodyEnd = nextDate;
    if (n + 1 < dateLines.length) {
      // Stop before the next entry's header lines.
      for (let i = nextDate - 1; i >= bodyStart && nextDate - i <= 2; i--) {
        if (isHeaderCandidate(lines, i)) bodyEnd = i;
        else break;
      }
    }
    entry.description = joinBullets(lines.slice(bodyStart, bodyEnd));
    entries.push(entry);
  });
  return entries;
}

function isHeaderCandidate(lines, i) {
  const line = lines[i];
  if (isBodyLine(line) || line.length > 80) return false;
  if (/^[a-z]/.test(line) || /[.;]$/.test(line)) return false;
  // Wrapped tail of a bullet: bullet above with no title or company signal here.
  const previous = lines[i - 1];
  if (previous && BULLET_RE.test(previous) && !TITLE_WORDS.test(line) && !COMPANY_WORDS.test(line)) return false;
  return true;
}

function joinBullets(lines) {
  const out = [];
  for (const line of lines) {
    if (BULLET_RE.test(line) || !out.length) out.push(stripBullet(line));
    else out[out.length - 1] += ` ${line}`;
  }
  return out.join('\n');
}

function joinWrapped(lines) {
  return lines.map(stripBullet).join(' ').replace(/\s+/g, ' ').trim();
}

// ---------- Education ----------

function findDegree(text) {
  const abbr = text.match(DEGREE_ABBR_RE);
  const full = text.match(DEGREE_RE);
  const match = full && (!abbr || full.index <= abbr.index) ? full : abbr;
  return match ? { text: match[0], index: match.index } : null;
}

function parseEducation(lines) {
  const entries = [];
  let entry = null;
  const start = () => {
    entry = { school: '', degree: '', field: '', gpa: '', location: '', startDate: '', endDate: '' };
    entries.push(entry);
  };

  for (const rawLine of lines) {
    let line = stripBullet(rawLine);

    let dates = extractDates(line);
    let start_ = '';
    let end_ = '';
    if (dates) {
      start_ = dates.start;
      end_ = dates.end;
      line = dates.rest;
    } else {
      const single = line.match(SINGLE_DATE_RE);
      if (single && normalizeDate(single[1])) {
        end_ = normalizeDate(single[1]);
        line = cleanParts(line.replace(single[0], ' '));
      }
    }

    let gpa = '';
    const gpaMatch = line.match(GPA_RE);
    if (gpaMatch) {
      gpa = (gpaMatch[1] || gpaMatch[2] || gpaMatch[3]).replace(/\s+/g, '');
      line = cleanParts(line.replace(gpaMatch[0], ' '));
    }

    const parts = line.split(/\s*[|•·∙]\s*|\s+[–—]\s+|,\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const degreePart = parts.find((p) => findDegree(p));
    const schoolPart = parts.find((p) => SCHOOL_WORDS.test(p) && p !== degreePart);

    if (!entry || (schoolPart && entry.school) || (degreePart && entry.degree)) start();

    if (degreePart) {
      const degree = findDegree(degreePart);
      const tail = degreePart.slice(degree.index + degree.text.length).replace(/^[\s.,:()–—-]*(?:(?:degree\s+)?in\s+)?/i, '').replace(/[()]/g, '').trim();
      const inside = degree.text.match(/^(.*?)\s+in\s+(.+)$/i);
      if (inside) {
        entry.degree = inside[1];
        entry.field = inside[2];
      } else {
        entry.degree = degree.text.trim();
        if (tail) entry.field = tail;
      }
    }
    if (schoolPart) entry.school = schoolPart;

    for (const part of parts) {
      if (part === degreePart || part === schoolPart) continue;
      if (schoolPart && !entry.location && /^[\p{L} .'-]+$/u.test(part)) {
        if (/university of \S+$/i.test(entry.school) && part.split(' ').length === 1 && !COUNTRIES.has(part.toLowerCase()) && !INDIAN_STATES.has(part.toLowerCase())) {
          entry.school += `, ${part}`;
        } else {
          entry.location = part;
        }
      } else if (degreePart && !schoolPart && !entry.field && /^[\p{L} &.'-]+$/u.test(part) && part.length > 3) {
        entry.field = part;
      } else if (schoolPart && entry.location && /^[\p{L} .'-]+$/u.test(part)) {
        entry.location += `, ${part}`;
      }
    }
    if (start_) entry.startDate = start_;
    if (end_) entry.endDate = end_;
    if (gpa) entry.gpa = gpa;
  }
  return entries.filter((e) => e.school || e.degree);
}

// ---------- Lists, projects, certifications ----------

function splitList(lines) {
  const seen = new Set();
  const items = [];
  for (const rawLine of lines) {
    const line = stripBullet(rawLine).replace(/^[\p{L} /&+-]{2,40}:\s*/u, '');
    let depth = 0;
    let current = '';
    const push = () => {
      const item = current.trim().replace(/[.]$/, '');
      current = '';
      if (item && item.length < 60 && !seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        items.push(item);
      }
    };
    for (const ch of line) {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && /[,;|•·∙]/.test(ch)) push();
      else current += ch;
    }
    push();
  }
  return items;
}

function parseProjects(lines, links) {
  const projects = [];
  let project = null;
  for (const line of lines) {
    if (project && (BULLET_RE.test(line) || /^[a-z]/.test(line) || isBodyLine(line))) {
      project.lines.push(line);
      continue;
    }
    let text = line;
    const dates = extractDates(text);
    if (dates) text = dates.rest;
    const url = (text.match(URL_RE) || [])[0] || '';
    text = text.replace(URL_RE, ' ').trim();
    const parts = text.split(/\s*[|•·∙]\s*|\s+[–—-]\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
    project = { name: parts[0] || '', url: cleanUrl(url), lines: parts.slice(1) };
    projects.push(project);
  }
  return projects
    .filter((p) => p.name)
    .map((p) => {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const linked = links.find((l) => /github\.com\/[^/]+\/[^/]+/i.test(l) && slug && l.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug));
      return { name: p.name, url: p.url || linked || '', description: joinBullets(p.lines) };
    });
}

function parseCertifications(lines) {
  return lines.map((line) => {
    let text = stripBullet(line);
    let date = '';
    const single = text.match(SINGLE_DATE_RE);
    if (single && normalizeDate(single[1])) {
      date = normalizeDate(single[1]);
      text = cleanParts(text.replace(single[0], ' '));
    }
    const split = text.match(/^(.+?)(?:\s+[–—-]\s+|\s*\|\s*|,\s+|\s+by\s+)(.+)$/);
    return split ? { name: split[1].trim(), issuer: split[2].trim(), date } : { name: text, issuer: '', date };
  }).filter((c) => c.name);
}

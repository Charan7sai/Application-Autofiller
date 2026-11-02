// Injected on demand into every frame of the tab. Fills fields it is confident about,
// outlines what it filled and what it left, and never submits anything.
(() => {
  if (window.__resumeAutofill) return;

  const FILLED_OUTLINE = '2px solid #16a34a';
  const REVIEW_OUTLINE = '2px solid #f59e0b';

  const AUTOCOMPLETE = {
    'given-name': 'firstName', 'additional-name': 'middleName', 'family-name': 'lastName', name: 'fullName',
    email: 'email', tel: 'phone', 'tel-national': 'phoneNational', 'tel-country-code': 'phoneCode',
    'street-address': 'address', 'address-line1': 'address', 'address-level2': 'city', 'address-level1': 'state',
    'postal-code': 'postalCode', 'country-name': 'country', country: 'country',
    organization: 'currentCompany', 'organization-title': 'currentTitle', url: 'website',
  };

  // Order matters: the first rule that matches wins, so specific rules come first.
  const RULES = [
    { key: 'resumeFile', re: /\b(resume|résumé|cv|curriculum vitae)\b/, not: /cover/, fileOnly: true },
    { key: 'firstName', re: /\b(first|given|fore) ?name\b|^fname$/ },
    { key: 'middleName', re: /\bmiddle ?(name|initial)?\b/ },
    { key: 'lastName', re: /\b(last|family|sur) ?name\b|\bsurname\b|^lname$/ },
    { key: 'email', re: /\be ?-?mail\b/ },
    { key: 'phoneCode', re: /\b(country|phone|dial(ing)?|isd) ?(phone )?code\b/ },
    { key: 'phone', re: /\b(phone|mobile|cell|telephone|whatsapp|contact (number|no))\b/, not: /\b(type|extension|ext)\b/ },
    { key: 'linkedin', re: /\blinked ?in\b/ },
    { key: 'github', re: /\bgit ?hub\b/ },
    { key: 'website', re: /\b(portfolio|personal (web ?)?site|web ?site|personal (url|link)|blog)\b/ },
    { key: 'postalCode', re: /\b(zip|postal|post|pin) ?(code)?\b/, not: /\bposts?\b$|position/ },
    { key: 'location', re: /\b(current |your )?location\b|where are you (currently )?(based|located)|current city/, group: null },
    { key: 'city', re: /\b(city|town)\b/ },
    { key: 'state', re: /\b(state|province|region)\b/, not: /united states|statement/ },
    { key: 'country', re: /\bcountry\b/, not: /code/ },
    { key: 'address', re: /\b(street|address( line)? ?1?|home address|mailing address)\b/, not: /e ?-?mail|web|\bline 2\b|\bip\b/ },

    { key: 'expectedSalary', re: /\b(expected|desired|salary expectation|expectations?)\b.*\b(salary|ctc|compensation|pay)\b|salary expectation/, question: true },
    { key: 'currentSalary', re: /\b(current|present)\b.*\b(salary|ctc|compensation)\b/, question: true },
    { key: 'noticePeriod', re: /\bnotice period\b/, question: true },
    { key: 'needsSponsorship', re: /\bsponsor(ship)?\b/, question: true },
    { key: 'workAuthorized', re: /\b(authori[sz]ed|eligible|right|legally allowed) to work\b|work authori[sz]ation/, question: true },
    { key: 'willingToRelocate', re: /\brelocat/, question: true },
    { key: 'yearsExperience', re: /\b(years? of (total |relevant |work |professional )?experience|total experience)\b/, not: /\b(with|in|using)\b/, question: true },

    { key: 'currentCompany', re: /\b(current|present|latest|most recent) (company|employer|organi[sz]ation)\b/ },
    { key: 'currentTitle', re: /\b(current|present|latest|most recent) (job )?(title|role|position|designation)\b|\bheadline\b|professional title/ },
    { key: 'summary', re: /\b(professional )?summary\b|\babout (you|yourself|me)\b|\bbio\b/, question: true },
    { key: 'skills', re: /\b(key |your |technical |relevant )?skills\b/, not: /\b(rate|how|which of)\b/ },

    { key: 'work.company', re: /\b(company|employer|organi[sz]ation)( name)?\b/, group: 'work' },
    { key: 'edu.school', re: /\b(school|university|college|institution|institute)( name)?\b/, group: 'edu' },
    { key: 'edu.degree', re: /\b(degree|qualification)\b/, group: 'edu' },
    { key: 'edu.field', re: /\b(field of study|major|discipline|specialization|specialisation|branch|area of study)\b/, group: 'edu' },
    { key: 'edu.gpa', re: /\b(c?gpa|grade|percentage|marks)\b/, group: 'edu' },
    { key: 'work.current', re: /\b(i )?(currently|presently) (work|working|employed)\b|\bcurrent (job|position|role|employer)\b|\bstill (work|working)\b|\bi work here\b/, group: 'work', checkboxOnly: true },
    { key: 'work.title', re: /\b(job |position |role )?title\b|\bdesignation\b|\b(job )?(position|role)\b/, group: 'work' },

    { key: '*.startMonth', re: /\b(start|from|begin)\w* ?(date )?month\b/, inGroup: true },
    { key: '*.startYear', re: /\b(start|from|begin)\w* ?(date )?year\b/, inGroup: true },
    { key: '*.endMonth', re: /\b(end|to|until|finish|graduation|completion)\w* ?(date )?month\b/, inGroup: true },
    { key: '*.endYear', re: /\b(end|to|until|finish|graduation|completion|passing)\w* ?(date )?year\b|\byear of (passing|graduation|completion)\b/, inGroup: true },
    { key: '*.start', re: /\b(start|from|begin)\w* ?date\b|\bdate from\b|^(start|from)$/, inGroup: true },
    { key: '*.end', re: /\b(end|finish|graduation|completion) ?date\b|\bdate to\b|^(end|to)$|\bgraduat(ion|ed)\b/, inGroup: true },
    { key: '*.description', re: /\b(description|responsibilit|duties|what did you do)/, inGroup: true, only: 'work' },
    { key: '*.location', re: /\b(location|city)\b/, inGroup: true },

    { key: 'fullName', re: /^(your |legal |full |candidate |applicant |complete )*name$|\bfull ?name\b|\blegal name\b/ },
  ];

  const SENSITIVE = /\b(gender|sex|ethnic\w*|race|racial|veteran|disab\w*|religion|caste|marital|date of birth|birth ?date|dob|nationality|citizenship|ssn|social security|aadh?aar|pan (card|number|no)|passport|bank|account number|ifsc|password|captcha|signature|pronouns?|sexual)\b/;
  const OTHER_PERSON = /\b(emergency|referen(ce|t)|referr(al|er|ed)|recruiter|guardian|spouse|father|mother|parent|next of kin|supervisor|hiring manager|reporting manager|manager)\b/;
  const GROUP_HINTS = [
    { group: 'edu', re: /\b(education|academic|school|university|college|degree|qualification)/ },
    { group: 'work', re: /\b(work|employment|professional|job|career|internship) ?(experience|history)?\b|\bexperience\b|\bemployer\b/ },
  ];

  const QUESTION_WORDS = /^(which|what|who|why|how|when|where|did|do|does|are|have|has|is|was|were|will|would|can|could|should)|\?$/;

  const norm = (text) =>
    String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]:*()/\\]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- Finding fields ----------

  function collectAll(root, selector, out = []) {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) collectAll(el.shadowRoot, selector, out);
    }
    return out;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && +style.opacity !== 0;
  }

  function byIdText(el, ids) {
    const root = el.getRootNode();
    return ids
      .split(/\s+/)
      .map((id) => root.getElementById?.(id)?.textContent || '')
      .join(' ');
  }

  function ownText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll?.('select,textarea,input,button,script,style,[role=listbox]').forEach((n) => n.remove());
    return clean(copy.textContent);
  }

  function labelOf(el) {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = clean(byIdText(el, labelledBy));
      if (text) return text;
    }
    const aria = el.getAttribute('aria-label');
    if (aria && clean(aria)) return clean(aria);
    if (el.labels && el.labels.length) {
      const text = clean([...el.labels].map(ownText).join(' '));
      if (text) return text;
    }
    const wrapping = el.closest('label');
    if (wrapping) {
      const text = ownText(wrapping);
      if (text) return text;
    }
    // Walk outwards: the nearest text before this field that belongs to it alone.
    let node = el;
    for (let depth = 0; depth < 4 && node.parentElement; depth++) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (!sibling.querySelector?.('input,select,textarea') && sibling.tagName !== 'SCRIPT' && sibling.tagName !== 'STYLE') {
          const text = ownText(sibling);
          if (text) return text.length <= 200 ? text : '';
        } else if (sibling.querySelector?.('input,select,textarea')) {
          return '';
        }
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
      if (node.querySelectorAll('input,select,textarea').length > 1) return '';
    }
    return '';
  }

  function attrText(el) {
    return ['name', 'id', 'data-automation-id', 'data-testid', 'data-qa', 'data-field', 'data-name', 'formcontrolname']
      .map((a) => el.getAttribute(a) || '')
      .filter(Boolean)
      .join(' ');
  }

  // The nearest heading above the field tells which section of the form it is in.
  function buildSectionLookup() {
    const headings = collectAll(document, 'h1,h2,h3,h4,h5,h6,legend,[role=heading]').filter((h) => clean(h.textContent));
    return (el) => {
      let found = '';
      for (const heading of headings) {
        if (heading.getRootNode() !== el.getRootNode() && heading.getRootNode() !== document) continue;
        if (heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = clean(heading.textContent);
        else break;
      }
      return found;
    };
  }

  function groupFrom(text) {
    const value = norm(text);
    for (const hint of GROUP_HINTS) {
      if (hint.re.test(value)) return hint.group;
    }
    return null;
  }

  function ancestorAttrs(el) {
    const parts = [];
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const value = [node.id, node.getAttribute('data-automation-id'), node.getAttribute('data-section'), node.getAttribute('aria-label')].filter(Boolean).join(' ');
      if (value) parts.push(value);
    }
    return parts.join(' ');
  }

  function matchRule(text, field, group) {
    const value = norm(text);
    if (!value) return null;
    for (const rule of RULES) {
      if (rule.fileOnly && field.kind !== 'file') continue;
      if (rule.checkboxOnly && field.kind !== 'checkbox') continue;
      if (field.kind === 'file' && !rule.fileOnly) continue;
      if (rule.inGroup && !group) continue;
      if (rule.only && rule.only !== group) continue;
      if (!rule.re.test(value) || (rule.not && rule.not.test(value))) continue;
      if ((value.length > 60 || QUESTION_WORDS.test(value)) && !rule.question) continue;
      if (rule.group && group && rule.group !== group) continue;
      if (rule.group === 'work' && !group && !/^(company|company name|employer|job title|title)$/.test(value)) continue;
      if (rule.key === 'location' && group) continue;
      return rule.key.replace('*', group || '');
    }
    return null;
  }

  function classify(field, sectionOf, state) {
    const { el, label, attrs, placeholder } = field;
    const labelNorm = norm(label);
    const section = sectionOf(el);

    if (SENSITIVE.test(norm(`${label} ${attrs}`))) return { reason: 'Personal question left for you' };
    if (OTHER_PERSON.test(labelNorm) || OTHER_PERSON.test(norm(section)) || OTHER_PERSON.test(norm(attrs))) {
      return { reason: 'About someone else, left for you' };
    }

    // The section only counts when it says so. Otherwise follow the previous repeating field.
    const sameSection = !section || section === state.lastSection;
    const group = groupFrom(`${attrs} ${ancestorAttrs(el)}`) || groupFrom(section) || (sameSection ? state.lastGroup : null);

    const autocomplete = (el.getAttribute('autocomplete') || '').split(/\s+/).pop();
    if (AUTOCOMPLETE[autocomplete] && !(group && /organization/.test(autocomplete))) return { key: AUTOCOMPLETE[autocomplete], group };

    const fromLabel = matchRule(label, field, group);
    if (fromLabel) return { key: fromLabel, group };
    if (label && labelNorm.length > 60) return { reason: 'Question left for you' };
    const fromAttrs = matchRule(attrs, field, group);
    if (fromAttrs) return { key: fromAttrs, group };
    const fromPlaceholder = matchRule(placeholder, field, group);
    if (fromPlaceholder) return { key: fromPlaceholder, group };
    return { reason: 'Not on your resume' };
  }

  // ---------- Values ----------

  function locationText(p) {
    return [p.city, p.state, p.country].filter(Boolean).join(', ');
  }

  function plainValue(key, p, field) {
    const extras = p.extras || {};
    const latest = (p.experience || [])[0] || {};
    switch (key) {
      case 'phone':
      case 'phoneNational': {
        const maxLength = field.el.maxLength;
        const national = p.phoneNational || p.phone;
        if (key === 'phoneNational' || field.formHasPhoneCode || field.el.type === 'number') return national;
        if (maxLength > 0 && p.phone.length > maxLength) return national;
        return p.phone;
      }
      case 'phoneCode': return p.phoneCountryCode;
      case 'location': return locationText(p);
      case 'currentCompany': return latest.current ? latest.company : '';
      case 'currentTitle': return latest.current ? latest.title : p.headline;
      case 'skills': return (p.skills || []).join(', ');
      case 'firstName': case 'middleName': case 'lastName': case 'fullName': case 'email':
      case 'address': case 'city': case 'state': case 'postalCode': case 'country':
      case 'linkedin': case 'github': case 'website': case 'summary':
        return p[key] || '';
      default:
        return extras[key] || '';
    }
  }

  function repeatValue(key, entry) {
    const name = key.split('.')[1];
    const field = {
      company: 'company', title: 'title', school: 'school', degree: 'degree', field: 'field', gpa: 'gpa',
      description: 'description', location: 'location',
    }[name];
    return field ? entry[field] || '' : '';
  }

  function dateParts(value) {
    const [year, month] = String(value || '').split('-');
    return { year: year || '', month: month || '' };
  }

  const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  // Writes a date in the format the field asks for. Returns '' when the resume has
  // too little detail for that format, because inventing a month would be wrong.
  function formatDate(value, el, hint) {
    const { year, month } = dateParts(value);
    if (!year) return '';
    if (el.type === 'date') return month ? `${year}-${month}-01` : '';
    if (el.type === 'month') return month ? `${year}-${month}` : '';
    const format = norm(`${el.placeholder || ''} ${el.getAttribute('data-format') || ''}`) || norm(hint);
    const raw = `${el.placeholder || ''} ${el.getAttribute('data-format') || ''}`.toLowerCase();
    if (/y{4}\s*[-/.]\s*m{2}/.test(raw)) return month ? `${year}${raw.match(/y{4}\s*([-/.])/)[1]}${month}` : '';
    if (/d{2}\s*[-/.]\s*m{2}\s*[-/.]\s*y{4}/.test(raw)) return month ? `01${raw.match(/d{2}\s*([-/.])/)[1]}${month}${raw.match(/d{2}\s*[-/.]\s*m{2}\s*([-/.])/)[1]}${year}` : '';
    if (/m{2}\s*[-/.]\s*d{2}\s*[-/.]\s*y{4}/.test(raw)) return month ? `${month}${raw.match(/m{2}\s*([-/.])/)[1]}01${raw.match(/m{2}\s*[-/.]\s*d{2}\s*([-/.])/)[1]}${year}` : '';
    if (/m{2}\s*[-/.]\s*y{2,4}/.test(raw)) return month ? `${month}${raw.match(/m{2}\s*([-/.])/)[1]}${year}` : '';
    if (/^\s*y{4}\s*$/.test(raw) || /\byear\b/.test(format)) return year;
    return month ? `${month}/${year}` : year;
  }

  // ---------- Writing values so frameworks notice ----------

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  function fire(el, ...types) {
    for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }

  function writeText(el, value) {
    el.focus({ preventScroll: true });
    if (el.isContentEditable) {
      el.textContent = value;
      fire(el, 'input', 'change');
    } else {
      setNativeValue(el, value);
      fire(el, 'input', 'change');
    }
    el.blur();
    fire(el, 'blur', 'focusout');
  }

  // ---------- Choosing from a list ----------

  const OPTION_ALIASES = [
    ['united states', 'usa', 'us', 'u s', 'u s a', 'united states of america', 'america'],
    ['united kingdom', 'uk', 'u k', 'great britain', 'britain', 'england'],
    ['united arab emirates', 'uae'],
    ['yes', 'y', 'true'],
    ['no', 'n', 'false'],
  ];
  const US_STATE_NAMES = { AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia' };

  function degreeLevel(text) {
    const value = String(text || '');
    if (/ph\.?\s?d|doctor/i.test(value)) return 'doctor';
    if (/master|m\.?\s?tech|m\.?\s?sc|\bm\.?s\b|\bmca\b|\bmba\b|\bm\.?e\b|\bm\.?a\b|\bm\.?com\b|post\s?graduate/i.test(value)) return 'master';
    if (/bachelor|b\.?\s?tech|b\.?\s?sc|\bb\.?s\b|\bbca\b|\bbba\b|\bb\.?e\b|\bb\.?a\b|\bb\.?com\b|undergraduate/i.test(value)) return 'bachelor';
    if (/associate/i.test(value)) return 'associate';
    if (/diploma/i.test(value)) return 'diploma';
    if (/high(er)? school|senior secondary|higher secondary|intermediate|12th|class xii|hsc/i.test(value)) return 'highschool';
    return null;
  }

  function optionMatch(texts, value, key) {
    const wanted = norm(value);
    if (!wanted) return -1;
    const options = texts.map(norm);
    const isPlaceholder = (t) => !t || /^(select|choose|please|none|--)/.test(t);

    let index = options.indexOf(wanted);
    if (index >= 0) return index;

    const alias = OPTION_ALIASES.find((set) => set.includes(wanted));
    if (alias) {
      index = options.findIndex((o) => alias.includes(o));
      if (index >= 0) return index;
      // Yes and No never match on a fragment: "No, I need a visa" is a different answer.
      if (alias[0] === 'yes' || alias[0] === 'no') {
        const hits = options.map((o, i) => (o.split(' ')[0] === alias[0] ? i : -1)).filter((i) => i >= 0);
        return hits.length === 1 ? hits[0] : -1;
      }
    }

    if (key === 'state') {
      const stateName = US_STATE_NAMES[String(value).trim().toUpperCase()];
      if (stateName) {
        index = options.indexOf(stateName);
        if (index >= 0) return index;
      }
      const code = Object.keys(US_STATE_NAMES).find((c) => US_STATE_NAMES[c] === wanted);
      if (code) {
        index = options.indexOf(code.toLowerCase());
        if (index >= 0) return index;
      }
    }

    if (key === 'edu.degree') {
      const level = degreeLevel(value);
      if (level) {
        const hits = texts.map((t, i) => (degreeLevel(t) === level ? i : -1)).filter((i) => i >= 0);
        if (hits.length === 1) return hits[0];
      }
    }

    if (key === 'phoneCode') {
      const digits = String(value).replace(/\D/g, '');
      const hits = texts.map((t, i) => (new RegExp(`\\+?\\b${digits}\\b`).test(t) ? i : -1)).filter((i) => i >= 0);
      return hits.length === 1 ? hits[0] : -1;
    }

    // Whole-word containment, and only when exactly one option qualifies.
    const wordsIn = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);
    const hits = options
      .map((o, i) => (!isPlaceholder(o) && o.length >= 3 && (wordsIn(o, wanted) || wordsIn(wanted, o)) ? i : -1))
      .filter((i) => i >= 0);
    return hits.length === 1 ? hits[0] : -1;
  }

  function fillSelect(el, value, key) {
    const options = [...el.options];
    let index = optionMatch(options.map((o) => o.textContent), value, key);
    if (index < 0) index = optionMatch(options.map((o) => o.value), value, key);
    if (index < 0) return false;
    setNativeValue(el, options[index].value);
    fire(el, 'input', 'change');
    return true;
  }

  function visibleOptions(el) {
    const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    const list = owned ? el.getRootNode().getElementById?.(owned) : null;
    const scope = list ? [list] : [document];
    const seen = scope.flatMap((root) => collectAll(root, '[role=option]'));
    return seen.filter(isVisible);
  }

  async function waitForOptions(el, timeout = 900) {
    const started = Date.now();
    let options = [];
    while (Date.now() - started < timeout) {
      options = visibleOptions(el);
      if (options.length) {
        await sleep(60);
        return visibleOptions(el);
      }
      await sleep(60);
    }
    return options;
  }

  function press(el, type, key) {
    el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, composed: true }));
  }

  function clickLikeUser(el) {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, composed: true, cancelable: true, button: 0 }));
    }
  }

  async function fillCombobox(el, value, key) {
    const typeable = el instanceof HTMLInputElement;
    el.focus({ preventScroll: true });
    clickLikeUser(el);
    if (typeable) {
      setNativeValue(el, key === 'edu.degree' ? '' : value);
      fire(el, 'input');
    }
    let options = await waitForOptions(el);
    if (!options.length && typeable && el.getAttribute('aria-expanded') !== 'true') {
      // Nothing to pick from, so this behaves as a plain text box.
      setNativeValue(el, value);
      fire(el, 'input', 'change', 'blur');
      return true;
    }
    let index = optionMatch(options.map((o) => clean(o.textContent)), value, key);
    if (index < 0 && typeable) {
      // The typed text can filter out the right option ("United States" hides "USA").
      setNativeValue(el, '');
      fire(el, 'input');
      await sleep(80);
      options = await waitForOptions(el);
      index = optionMatch(options.map((o) => clean(o.textContent)), value, key);
    }
    if (index >= 0) {
      clickLikeUser(options[index]);
      await sleep(40);
      return true;
    }
    press(el, 'keydown', 'Escape');
    el.blur();
    return false;
  }

  function isCombobox(el) {
    return (
      el.getAttribute('role') === 'combobox' ||
      el.getAttribute('aria-autocomplete') === 'list' ||
      el.getAttribute('aria-haspopup') === 'listbox'
    );
  }

  function currentValue(el) {
    if (el instanceof HTMLSelectElement) {
      const option = el.options[el.selectedIndex];
      return option && option.value && !/^(select|choose|please)/i.test(clean(option.textContent)) ? option.value : '';
    }
    if (el.tagName === 'BUTTON') {
      const text = clean(el.textContent);
      return /^(select|choose|please|--)/i.test(text) || !text ? '' : text;
    }
    if (el.isContentEditable) return clean(el.textContent);
    return el.value;
  }

  // ---------- Radio groups ----------

  function radioQuestion(radio) {
    const group = radio.closest('[role=radiogroup],fieldset,[role=group]');
    if (group) {
      const legend = group.querySelector('legend');
      if (legend) return clean(legend.textContent);
      const named = group.getAttribute('aria-labelledby');
      if (named) return clean(byIdText(group, named));
      if (group.getAttribute('aria-label')) return clean(group.getAttribute('aria-label'));
    }
    let node = radio.closest('label') || radio;
    for (let depth = 0; depth < 4 && node.parentElement; depth++) {
      const parent = node.parentElement;
      if (parent.querySelectorAll('input[type=radio]').length > 1) {
        let sibling = parent.previousElementSibling;
        if (sibling && clean(sibling.textContent)) return clean(sibling.textContent);
        const first = parent.firstElementChild;
        if (first && !first.querySelector('input') && clean(first.textContent)) return clean(first.textContent);
        return '';
      }
      node = parent;
    }
    return '';
  }

  // ---------- Main ----------

  function base64ToFile(info) {
    const bytes = Uint8Array.from(atob(info.base64), (c) => c.charCodeAt(0));
    return new File([bytes], info.name, { type: info.type });
  }

  function outline(el, style) {
    const target = el.type === 'file' && !isVisible(el) ? el.parentElement || el : el;
    target.style.setProperty('outline', style, 'important');
    target.style.setProperty('outline-offset', '1px', 'important');
  }

  function isLoginForm(el) {
    const form = el.closest('form');
    if (!form || !form.querySelector('input[type=password]')) return false;
    return form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=password])').length <= 2;
  }

  function isRequired(el, label) {
    return el.required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(label);
  }

  function gatherFields() {
    const selector = 'input,select,textarea,[contenteditable=true],button[aria-haspopup=listbox]';
    const fields = [];
    const skipTypes = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color', 'radio']);
    for (const el of collectAll(document, selector)) {
      if (el.disabled || el.readOnly) continue;
      const type = (el.type || '').toLowerCase();
      if (el.tagName === 'INPUT' && skipTypes.has(type)) continue;
      const kind = type === 'file' ? 'file' : type === 'checkbox' ? 'checkbox' : 'text';
      if (kind !== 'file' && !isVisible(el)) continue;
      if (isLoginForm(el)) continue;
      let label = labelOf(el);
      if (kind === 'file' && !label) {
        // Upload widgets usually hide the input inside a labelled box.
        let node = el.parentElement;
        for (let depth = 0; node && depth < 3 && !label; depth++, node = node.parentElement) {
          if (node.querySelectorAll('input[type=file]').length === 1) label = ownText(node).slice(0, 80);
        }
      }
      fields.push({ el, kind, label, attrs: attrText(el), placeholder: el.getAttribute('placeholder') || '' });
    }
    return fields;
  }

  async function fill(profile, resumeFile) {
    const report = { filled: [], review: [], extraSlots: {} };
    const sectionOf = buildSectionLookup();
    const counters = {};
    const state = { lastGroup: null, lastSection: '' };

    const fields = gatherFields();
    const classified = fields.map((field) => {
      const result = classify(field, sectionOf, state);
      if (result.key && result.key.includes('.')) {
        state.lastGroup = result.key.split('.')[0];
        state.lastSection = sectionOf(field.el);
      }
      return { field, ...result };
    });
    const hasPhoneCode = classified.some((c) => c.key === 'phoneCode');

    const ok = (field, key) => {
      outline(field.el, FILLED_OUTLINE);
      report.filled.push({ label: clean(field.label || field.placeholder || field.attrs).slice(0, 60), key });
    };
    const needsYou = (field, reason) => {
      const label = clean(field.label || field.placeholder || field.attrs).slice(0, 60);
      if (!label) return;
      outline(field.el, REVIEW_OUTLINE);
      report.review.push({ label, reason, required: isRequired(field.el, field.label) });
    };

    // Upload first: many sites parse the file and overwrite fields afterwards.
    let uploaded = false;
    for (const item of classified) {
      if (item.field.kind !== 'file' || item.key !== 'resumeFile') continue;
      if (item.field.el.files.length || !resumeFile) continue;
      const transfer = new DataTransfer();
      transfer.items.add(base64ToFile(resumeFile));
      item.field.el.files = transfer.files;
      fire(item.field.el, 'input', 'change');
      ok(item.field, 'resumeFile');
      uploaded = true;
    }
    if (uploaded) await sleep(1200);

    for (const item of classified) {
      const { field, key, reason } = item;
      const { el, kind } = field;
      if (kind === 'file') {
        if (key !== 'resumeFile' && isRequired(el, field.label)) needsYou(field, 'Upload this yourself');
        continue;
      }
      if (!key) {
        if (kind !== 'checkbox' && (isRequired(el, field.label) || reason !== 'Not on your resume')) {
          if (!currentValue(el)) needsYou(field, reason);
        }
        continue;
      }

      let value = '';
      if (key.includes('.')) {
        const [group, name] = key.split('.');
        const index = counters[key] || 0;
        counters[key] = index + 1;
        const entries = group === 'work' ? profile.experience : profile.education;
        const entry = (entries || [])[index];
        if (!entry) continue;

        if (name === 'current') {
          if (entry.current && !el.checked) {
            clickLikeUser(el);
            ok(field, key);
          }
          continue;
        }
        if (['start', 'end', 'startMonth', 'startYear', 'endMonth', 'endYear'].includes(name)) {
          const date = name.startsWith('start') ? entry.startDate : entry.endDate;
          if (name.startsWith('end') && entry.current) continue;
          const parts = dateParts(date);
          if (name.endsWith('Month')) {
            if (!parts.month) value = '';
            else if (el instanceof HTMLSelectElement || isCombobox(el)) {
              const names = [MONTH_NAMES[+parts.month - 1], MONTH_NAMES[+parts.month - 1].slice(0, 3), parts.month, String(+parts.month)];
              let done = false;
              for (const candidate of names) {
                done = el instanceof HTMLSelectElement ? fillSelect(el, candidate, key) : await fillCombobox(el, candidate, key);
                if (done) break;
              }
              if (done) ok(field, key);
              else needsYou(field, 'Pick this yourself');
              continue;
            } else value = parts.month;
          } else if (name.endsWith('Year')) {
            value = parts.year;
          } else {
            value = el instanceof HTMLSelectElement ? parts.year : formatDate(date, el, field.label);
          }
        } else {
          value = repeatValue(key, entry);
        }
      } else {
        value = plainValue(key, profile, { ...field, formHasPhoneCode: hasPhoneCode });
      }

      if (kind === 'checkbox') continue;
      if (!value) {
        if (!currentValue(el)) needsYou(field, 'Not on your resume');
        continue;
      }
      if (currentValue(el)) continue; // Never overwrite what is already there.

      let done = true;
      if (el instanceof HTMLSelectElement) done = fillSelect(el, value, key);
      else if (isCombobox(el)) done = await fillCombobox(el, value, key);
      else writeText(el, value);

      if (done) ok(field, key);
      else needsYou(field, `No option matches "${String(value).slice(0, 30)}"`);
    }

    fillRadios(profile, report, sectionOf);

    const slots = (name) => counters[name] || 0;
    const work = (profile.experience || []).length;
    const edu = (profile.education || []).length;
    if (slots('work.company') && slots('work.company') < work) report.extraSlots.work = work - slots('work.company');
    if (slots('edu.school') && slots('edu.school') < edu) report.extraSlots.edu = edu - slots('edu.school');
    return report;
  }

  function fillRadios(profile, report, sectionOf) {
    const groups = new Map();
    for (const radio of collectAll(document, 'input[type=radio]')) {
      if (radio.disabled) continue;
      const id = radio.name || radio.closest('[role=radiogroup],fieldset') || radio;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(radio);
    }
    for (const radios of groups.values()) {
      const question = radioQuestion(radios[0]);
      const value = norm(question);
      if (!value || SENSITIVE.test(value) || OTHER_PERSON.test(value) || OTHER_PERSON.test(norm(sectionOf(radios[0])))) continue;
      if (radios.some((r) => r.checked)) continue;
      const rule = RULES.find((r) => r.question && r.re.test(value) && !(r.not && r.not.test(value)));
      const answer = rule ? (profile.extras || {})[rule.key] : '';
      if (!answer) continue;
      const index = optionMatch(radios.map(labelOf), answer, rule.key);
      if (index < 0) continue;
      clickLikeUser(radios[index]);
      if (!radios[index].checked) {
        radios[index].checked = true;
        fire(radios[index], 'input', 'change');
      }
      outline(radios[index], FILLED_OUTLINE);
      report.filled.push({ label: question.slice(0, 60), key: rule.key });
    }
  }

  function toast(message) {
    document.getElementById('__resume_autofill_toast')?.remove();
    const box = document.createElement('div');
    box.id = '__resume_autofill_toast';
    box.textContent = message;
    box.style.cssText =
      'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:12px 14px;border-radius:8px;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), 6000);
  }

  window.__resumeAutofill = { fill, toast };
})();

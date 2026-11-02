const $ = (id) => document.getElementById(id);
const { profile } = await chrome.storage.local.get('profile');

const openProfile = () => {
  chrome.runtime.openOptionsPage();
  window.close();
};
$('upload').addEventListener('click', openProfile);
$('edit').addEventListener('click', openProfile);

if (!profile) {
  $('empty').hidden = false;
} else {
  $('ready').hidden = false;
  $('name').textContent = profile.fullName || 'Your details';
  $('email').textContent = profile.email;
}

$('fill').addEventListener('click', async () => {
  const button = $('fill');
  button.disabled = true;
  button.textContent = 'Filling…';
  $('result').replaceChildren();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const summary = await chrome.runtime.sendMessage({ type: 'fill', tabId: tab.id });
  button.disabled = false;
  button.textContent = 'Fill this page';
  render(summary);
});

function line(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function render(summary) {
  const out = $('result');
  if (summary.error === 'blocked') {
    out.append(line('div', 'note', 'Brave does not let extensions change this page. Try it on the form itself.'));
    return;
  }
  if (summary.error) {
    out.append(line('div', 'note', 'Add your resume first.'));
    return;
  }

  out.append(line('div', 'count', `${summary.filled.length} field${summary.filled.length === 1 ? '' : 's'} filled`));

  if (summary.review.length) {
    out.append(line('div', 'count warn', `${summary.review.length} need${summary.review.length === 1 ? 's' : ''} you`));
    const list = document.createElement('ul');
    const ordered = [...summary.review].sort((a, b) => Number(b.required) - Number(a.required));
    for (const item of ordered) {
      const row = line('li', '', `${item.label}${item.required ? ' *' : ''}`);
      row.append(line('small', '', item.reason));
      list.append(row);
    }
    out.append(list);
  }

  const { work, edu } = summary.extraSlots;
  if (work) out.append(line('div', 'note', `${work} more job${work === 1 ? '' : 's'} to add. Click "Add" on the form, then fill again.`));
  if (edu) out.append(line('div', 'note', `${edu} more education entr${edu === 1 ? 'y' : 'ies'} to add. Click "Add" on the form, then fill again.`));
  out.append(line('div', 'note', 'Nothing was submitted. Check it before you send.'));
}

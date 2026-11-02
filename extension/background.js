// Runs the filler in every frame of a tab and combines what each frame reports.

async function fillTab(tabId) {
  const { profile, resumeFile } = await chrome.storage.local.get(['profile', 'resumeFile']);
  if (!profile) return { error: 'no-profile' };

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content/filler.js'],
    });
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (p, f) => window.__resumeAutofill?.fill(p, f),
      args: [profile, resumeFile || null],
    });

    const summary = { filled: [], review: [], extraSlots: {} };
    for (const { result } of frames) {
      if (!result) continue;
      summary.filled.push(...result.filled);
      summary.review.push(...result.review);
      Object.assign(summary.extraSlots, result.extraSlots);
    }

    const needs = summary.review.length;
    const message = summary.filled.length
      ? `Filled ${summary.filled.length} field${summary.filled.length === 1 ? '' : 's'}${needs ? `, ${needs} need${needs === 1 ? 's' : ''} you (orange)` : ''}. Check it, then submit yourself.`
      : 'Found nothing to fill on this page.';
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text) => window.__resumeAutofill?.toast(text),
      args: [message],
    });
    return summary;
  } catch (error) {
    return { error: 'blocked', detail: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'fill') {
    fillTab(message.tabId).then(respond);
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) fillTab(tab.id);
});

# Resume Autofill for Brave

Upload your resume once, check the details, then fill forms with one click. It never submits anything.

## Install

1. Open `brave://extensions` in Brave.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Pin Resume Autofill to the toolbar from the puzzle-piece menu.

Keep the `extension` folder where it is. Brave loads the extension from that folder each time it starts.

## Use

1. Click the icon, then **Upload resume**, and choose your PDF, DOCX or TXT.
2. Check the details on that page. Orange boxes were not found in your resume. Edits save by themselves.
3. Open an application form and click **Fill this page**, or press `Alt+Shift+F`.
4. Green outlines were filled. Orange outlines need you. Review the form and submit it yourself.

If the form has fewer job or education slots than your resume, click its "Add" button and fill again. Fields that already have a value are never overwritten.

## What it leaves alone

- Gender, race, disability, veteran status, date of birth, ID numbers and similar questions.
- Open questions such as "Why do you want this job?".
- Emergency contacts, references and login forms.
- Work authorization, sponsorship, notice period and salary, unless you answer them on the details page.
- Dropdown options that do not clearly match your details. It flags these instead of guessing.

## Privacy

Everything stays in this browser. Nothing leaves it unless you turn on the AI option, which sends your resume to Anthropic with each upload, using your own API key. The AI model is set by `MODEL` in `src/ai-parser.js`; run `npm run build` after changing it.

The extension asks to read and change data on all sites because application forms live on many domains and in embedded frames. It only touches a page when you click Fill or press the shortcut.

## Development

```bash
npm install
```

```bash
npm run build
```

```bash
node test/make-fixtures.mjs
```

```bash
npm test
```

The tests load the extension into Brave with a throwaway profile and use fictional resumes and local forms.

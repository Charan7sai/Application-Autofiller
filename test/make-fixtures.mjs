// Generates fictional sample resumes: a one-column PDF, a two-column PDF and a DOCX.
import PDFDocument from 'pdfkit';
import { createWriteStream, writeFileSync, mkdirSync } from 'node:fs';
import { Document, Packer, Paragraph, TextRun, ExternalHyperlink } from 'docx';
import { once } from 'node:events';

mkdirSync('test/fixtures', { recursive: true });

async function pdf(path, draw) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const out = createWriteStream(path);
  doc.pipe(out);
  draw(doc);
  doc.end();
  await once(out, 'finish');
}
const H = (d, t) => {
  d.moveDown(0.6).font('Helvetica-Bold').fontSize(12).text(t);
  d.font('Helvetica').fontSize(10);
};

await pdf('test/fixtures/one-column.pdf', (d) => {
  d.font('Helvetica-Bold').fontSize(20).text('PRIYA ANJALI SHARMA');
  d.font('Helvetica').fontSize(10);
  d.text('Hyderabad, Telangana, India 500032');
  d.text('+91 98765 43210 | priya.sharma@example.com');
  d.text('LinkedIn', { link: 'https://www.linkedin.com/in/priya-sharma-demo', continued: true })
    .text(' | ', { link: null, continued: true })
    .text('github.com/priyasharma-demo', { link: 'https://github.com/priyasharma-demo' });
  H(d, 'SUMMARY');
  d.text('Backend engineer with three years of experience building payment services at scale.');
  H(d, 'EXPERIENCE');
  const row = (l, r) => {
    const y = d.y;
    d.font('Helvetica-Bold').text(l, 40, y, { lineBreak: false });
    d.font('Helvetica').text(r, 400, y, { width: 155, align: 'right' });
    d.x = 40;
  };
  row('Senior Software Engineer', 'Jan 2023 - Present');
  d.text('Northwind Technologies Pvt Ltd | Bengaluru, Karnataka');
  d.text('• Built a ledger service handling two million transactions per day using Go and Postgres across three regions with strong consistency guarantees and audit trails');
  d.text('• Reduced checkout latency by 40 percent');
  row('Software Engineer Intern', 'May 2021 - Dec 2022');
  d.text('Contoso Labs | Remote');
  d.text('• Wrote integration tests for the billing API');
  H(d, 'EDUCATION');
  row('Indian Institute of Technology Hyderabad', '2017 - 2021');
  d.text('B.Tech in Computer Science, CGPA: 8.7/10');
  row('Narayana Junior College', '2015 - 2017');
  d.text('Intermediate, 96%');
  H(d, 'TECHNICAL SKILLS');
  d.text('Languages: Go, Python, Java');
  d.text('Tools: Docker, Kubernetes, Postgres');
  H(d, 'PROJECTS');
  d.text('Ledgerlite | github.com/priyasharma-demo/ledgerlite');
  d.text('• Small double-entry ledger library');
  H(d, 'CERTIFICATIONS');
  d.text('AWS Solutions Architect - Amazon, Mar 2024');
  H(d, 'LANGUAGES');
  d.text('English, Hindi, Telugu');
});

await pdf('test/fixtures/two-column.pdf', (d) => {
  d.font('Helvetica-Bold').fontSize(20).text('Daniel Okafor', 40, 40);
  d.font('Helvetica').fontSize(10).text('Product Designer', 40, 66);
  const L = 40, R = 230, W = 170, RW = 325;
  let y = 100;
  const left = (t, b) => {
    d.font(b ? 'Helvetica-Bold' : 'Helvetica').fontSize(b ? 11 : 10).text(t, L, y, { width: W, lineBreak: false });
    y += 15;
  };
  left('CONTACT', true);
  left('daniel.okafor@example.org');
  left('(415) 555-0134');
  left('Austin, TX');
  left('danielokafor.dev');
  y += 8;
  left('SKILLS', true);
  for (const s of ['Figma', 'Prototyping', 'User Research', 'Design Systems', 'HTML', 'CSS', 'Accessibility']) left(s);
  y += 8;
  left('LANGUAGES', true);
  left('English');
  left('Spanish');
  y += 8;
  left('INTERESTS', true);
  left('Cycling');
  left('Ceramics');
  left('Typography');
  y = 100;
  const right = (t, b) => {
    d.font(b ? 'Helvetica-Bold' : 'Helvetica').fontSize(b ? 11 : 10).text(t, R, y, { width: RW, lineBreak: false });
    y += 15;
  };
  right('WORK EXPERIENCE', true);
  right('Lead Designer | March 2022 - Present', true);
  right('Fabrikam Inc | Austin, TX');
  right('• Led redesign of the mobile checkout flow');
  right('• Built the company design system');
  right('• Mentored four junior designers');
  y += 6;
  right('Product Designer | 06/2019 - 02/2022', true);
  right('Adventure Works LLC | Remote');
  right('• Shipped onboarding for two products');
  right('• Ran weekly usability sessions');
  y += 8;
  right('EDUCATION', true);
  right('University of Texas at Austin', true);
  right('Bachelor of Fine Arts in Design');
  right('2015 - 2019');
  right('GPA: 3.8/4.0');
});

const P = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, bold: o.bold })], bullet: o.bullet ? { level: 0 } : undefined });
const docx = new Document({
  sections: [{
    children: [
      P('Meera Nair', { bold: true }),
      P('Kochi, Kerala | meera.nair@example.net | +91-90000-12345'),
      new Paragraph({ children: [new ExternalHyperlink({ link: 'https://linkedin.com/in/meera-nair-demo', children: [new TextRun('My LinkedIn')] })] }),
      P('Work Experience', { bold: true }),
      P('Data Analyst, Tailspin Toys Ltd'),
      P('Aug 2022 to Present'),
      P('Built weekly revenue dashboards', { bullet: true }),
      P('Education', { bold: true }),
      P('M.Sc. in Statistics, University of Kerala, 2020 - 2022'),
      P('Skills', { bold: true }),
      P('SQL, Python, Tableau'),
    ],
  }],
});
writeFileSync('test/fixtures/resume.docx', await Packer.toBuffer(docx));

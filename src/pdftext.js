'use strict';
// PDFs that bots find (in Classroom, Drive, on a web page) are read as text with the same PDF reader the app uses for
// files you attach (pdf.js in the Wayzerr window), so a bot never has to ask you to open or paste one.
let getWin = () => null;
const setWindow = (fn) => { getWin = fn; };

async function pdfText(buf, name = 'file.pdf') {
  const win = getWin();
  if (!win || win.isDestroyed()) throw new Error('the Wayzerr window is closed, so the PDF could not be read');
  if (buf.length > 60 * 1024 * 1024) throw new Error('this PDF is over 60 MB, too big to read');
  const b64 = Buffer.from(buf).toString('base64');
  return win.webContents.executeJavaScript(`(async () => {
    const b = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const r = await readPdf(new File([b], ${JSON.stringify(String(name).slice(0, 120))}, { type: 'application/pdf' }));
    return { text: r.text, pages: r.pages, scanned: !!r.scanned, image: (r.images && r.images[0] && r.images[0].dataUrl) || null };
  })()`, true);
}

module.exports = { setWindow, pdfText };

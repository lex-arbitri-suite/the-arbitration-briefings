import { Development } from '../types';
import { validateSourceUrl } from './urlValidator';

/** Generates an HTML document for the daily intelligence digest and opens a browser print dialogue. */
/**
 * Builds the daily digest markup from the provided developments, opens a print window,
 * and triggers the browser print dialogue once the document has loaded.
 *
 * @param visibleLatestDevelopments Development entries to include in the digest output.
 */
export const handleDownloadDailyDigest = (visibleLatestDevelopments: Development[]): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }

  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let htmlContent = `
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #8B2C2C; font-family: 'Georgia', serif; font-size: 24px; margin-bottom: 8px;">The Arbitration Briefings</h1>
        <h2 style="color: #1a1a1a; font-family: 'Georgia', serif; font-size: 18px; margin-bottom: 8px;">Daily Intelligence Digest</h2>
        <p style="color: #8B2C2C; font-family: 'Inter', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Analyse and Summarise</p>
        <p style="color: #737373; font-family: 'Inter', sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">${currentDate}</p>
      </div>
      <div style="display: flex; flex-direction: column; gap: 24px;">
    `;

  visibleLatestDevelopments.forEach((dev: Development) => {
    if (dev.isPlaceholder) return;

    let updatesHtml = '';
    if (dev.updates && dev.updates.length > 0) {
      updatesHtml = `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e5e5;">
            <p style="font-family: 'Inter', sans-serif; font-size: 10px; font-weight: bold; color: #8B2C2C; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Latest Updates to Analyse</p>
            <ul style="margin: 0; padding-left: 16px; color: #4a4a4a; font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.5;">
              ${dev.updates.map((u: string) => `<li>${escapeHtml(u)}</li>`).join('')}
            </ul>
          </div>
        `;
    }

    htmlContent += `
        <div style="border: 1px solid #e5e5e5; padding: 20px; border-radius: 4px; background: #fdfdfc; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-family: 'Inter', sans-serif; font-size: 10px; font-weight: bold; color: #8B2C2C; background: #f0eee9; padding: 4px 8px; border-radius: 2px; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(dev.category)}</span>
            <span style="font-family: 'Inter', sans-serif; font-size: 10px; color: #737373;">${escapeHtml(dev.date)}</span>
          </div>
          <h3 style="font-family: 'Georgia', serif; font-size: 16px; color: #1a1a1a; margin: 0 0 8px 0;">${escapeHtml(dev.title)}</h3>
          <p style="font-family: 'Inter', sans-serif; font-size: 12px; color: #4a4a4a; line-height: 1.6; margin: 0;">${escapeHtml(dev.summary)}</p>
          ${updatesHtml}
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0eee9;">
            ${dev.urlVerified !== false && validateSourceUrl(dev.sourceUrl).isValid
        ? `<a href="${escapeHtml(dev.sourceUrl)}" style="font-family: 'Inter', sans-serif; font-size: 10px; color: #8B2C2C; text-decoration: none;">Analyse Source Document &rarr;</a>`
        : `<span style="font-family: 'Inter', sans-serif; font-size: 10px; color: #737373; font-style: italic;">Source: unverified link demoted</span>`
      }          </div>
        </div>
      `;
  });

  htmlContent += `</div>`;

  printWindow.document.write(`
      <html>
        <head>
          <title>Daily Digest - ${currentDate}</title>
          <style>
            @media print {
              @page { margin: 0; size: a4; }
              body { background: #F9F9F7; padding: 20mm; }
            }
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              background: #F9F9F7;
              color: #1a1a1a;
              max-width: 800px;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          ${htmlContent}
          <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center;">
            <p style="font-family: 'Inter', sans-serif; font-size: 10px; color: #737373; text-transform: uppercase; letter-spacing: 1px; line-height: 1.6;">
              The Arbitration Briefings utilises artificial intelligence. Please verify all outputs against primary source texts.
            </p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
  printWindow.document.close();
};

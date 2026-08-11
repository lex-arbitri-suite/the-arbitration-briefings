import { Message } from '../types';

/** Generates an HTML document from a chat transcript and opens a browser print dialogue for PDF export. */
export const printChatTranscript = (messages: Message[], chatTitle: string | undefined) => {
  if (messages.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }

  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  let messagesHtml = '';
  messages.forEach((msg) => {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? 'RESEARCH ENQUIRY' : 'THE ARBITRATION BRIEFING';
    const fontFamily = isUser ? "'Inter', sans-serif" : "'Georgia', serif";
    const fontSize = isUser ? '13px' : '15px';
    const escaped = escapeHtml(msg.content);
    const contentHtml = escaped.replace(/\n/g, '<br/>');

    messagesHtml += `
      <div style="margin-bottom: 32px; page-break-inside: avoid;">
        <p style="font-family: 'Inter', sans-serif; font-size: 10px; font-weight: bold; color: #8B2C2C; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 1px solid #e5e5e5;">${roleLabel}</p>
        <div style="font-family: ${fontFamily}; font-size: ${fontSize}; color: #1a1a1a; line-height: 1.7;">${contentHtml}</div>
      </div>`;
  });

  const titleHtml = chatTitle
    ? `<p style="font-family: 'Georgia', serif; font-size: 14px; color: #1a1a1a; margin: 16px 0 0 0;">Subject: ${escapeHtml(chatTitle)}</p>`
    : '';

  printWindow.document.write(`
    <html>
      <head>
        <title>The Arbitration Briefings - ${currentDate}</title>
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
        <div style="text-align: center; margin-bottom: 48px;">
          <h1 style="font-family: 'Georgia', serif; font-size: 24px; color: #8B2C2C; letter-spacing: 2px; margin: 0 0 8px 0;">THE ARBITRATION BRIEFINGS</h1>
          <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 1px; margin: 0;">${currentDate}</p>
          ${titleHtml}
        </div>
        ${messagesHtml}
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

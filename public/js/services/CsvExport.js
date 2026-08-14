'use strict';

/**
 * CsvExport - builds a CSV file client-side and triggers a download.
 * No server round trip: every export in the app works from data the page
 * already has (or fetches itself), the same way PDF generation is entirely
 * client-side via PdfService.
 */
class CsvExport {
  /**
   * @param {string} filename e.g. "expenses-SW-260101-123.csv"
   * @param {object[]} rows
   * @param {{key: string, label: string}[]} columns
   */
  static download(filename, rows, columns) {
    const escape = (value) => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c) => escape(c.label)).join(',');
    const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','));
    // No leading BOM: it was meant to help Excel detect UTF-8, but it can
    // confuse other apps' delimiter auto-detection into treating the whole
    // line as one field instead of splitting on commas.
    const csv = [header, ...lines].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.CsvExport = CsvExport;

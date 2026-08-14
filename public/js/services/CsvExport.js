'use strict';

/**
 * CsvExport - builds a CSV file client-side and triggers a download.
 * No server round trip: every export in the app works from data the page
 * already has (or fetches itself), the same way PDF generation is entirely
 * client-side via PdfService.
 */
class CsvExport {
  static _escape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  static _trigger(filename, lines) {
    // "sep=," as the literal first line tells Excel to use a comma for THIS
    // file specifically, overriding Windows' Regional Settings "list
    // separator" - which is what Excel actually uses when a .csv is opened
    // by double-clicking, and is comma only on some locales. Without this,
    // a semicolon-locale Windows install dumps every field into one column.
    // No leading BOM: it was meant to help Excel detect UTF-8, but it can
    // confuse other apps' delimiter auto-detection into treating the whole
    // line as one field instead of splitting on commas.
    const csv = ['sep=,', ...lines].join('\r\n');

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

  /**
   * @param {string} filename e.g. "expenses-SW-260101-123.csv"
   * @param {object[]} rows
   * @param {{key: string, label: string}[]} columns
   */
  static download(filename, rows, columns) {
    const header = columns.map((c) => CsvExport._escape(c.label)).join(',');
    const lines = rows.map((row) => columns.map((c) => CsvExport._escape(row[c.key])).join(','));
    CsvExport._trigger(filename, [header, ...lines]);
  }

  /**
   * One CSV file containing several stacked tables (title + header + rows),
   * separated by a blank line - Excel opens this as a single neatly
   * sectioned sheet rather than needing one file per category.
   * @param {string} filename
   * @param {{title: string, columns: {key: string, label: string}[], rows: object[]}[]} sections
   */
  static downloadMultiTable(filename, sections) {
    const lines = [];
    sections.forEach((section, i) => {
      if (i > 0) lines.push('');
      lines.push(CsvExport._escape(section.title));
      lines.push(section.columns.map((c) => CsvExport._escape(c.label)).join(','));
      section.rows.forEach((row) => {
        lines.push(section.columns.map((c) => CsvExport._escape(row[c.key])).join(','));
      });
    });
    CsvExport._trigger(filename, lines);
  }
}

window.CsvExport = CsvExport;

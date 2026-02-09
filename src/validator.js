/**
 * Validate CSV rows for required columns and correct formats.
 * Returns { valid: [...], invalid: [...] }
 */
export function validateCsv(rows) {
  if (!rows || rows.length === 0) {
    return { valid: [], invalid: [{ row: 0, reason: 'CSV file is empty' }] };
  }

  // Check required columns exist
  const firstRow = rows[0];
  if (!('url' in firstRow)) {
    return { valid: [], invalid: [{ row: 0, reason: 'Missing required column: "url"' }] };
  }
  if (!('property' in firstRow)) {
    return { valid: [], invalid: [{ row: 0, reason: 'Missing required column: "property"' }] };
  }

  const valid = [];
  const invalid = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors = [];

    // Validate URL format
    if (!row.url || !isValidUrl(row.url)) {
      errors.push('Invalid or missing URL (must be fully-qualified, e.g. https://example.com/page)');
    }

    // Validate property format
    if (!row.property || !isValidProperty(row.property)) {
      errors.push('Invalid or missing property (must be https://... with trailing slash, or sc-domain:...)');
    }

    if (errors.length > 0) {
      invalid.push({ row: i + 1, url: row.url, property: row.property, reasons: errors });
    } else {
      valid.push(row);
    }
  }

  return { valid, invalid };
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidProperty(property) {
  if (property.startsWith('sc-domain:')) {
    return property.length > 'sc-domain:'.length;
  }
  try {
    const parsed = new URL(property);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && property.endsWith('/');
  } catch {
    return false;
  }
}

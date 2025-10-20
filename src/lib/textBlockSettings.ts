export type TextBlockSettings = {
  fontFamily: string | null;
  backgroundColor: string | null;
};

export type TextBlockSettingsInput = {
  fontFamily?: string | null;
  backgroundColor?: string | null;
};

export const TEXT_BLOCK_FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Default', value: '' },
  { label: 'Body (Poppins)', value: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif' },
  { label: 'Heading (League Spartan)', value: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif' },
  {
    label: 'Handwritten (Permanent Marker)',
    value: '"Permanent Marker", "cursive", "Roboto", "Helvetica", "Arial", sans-serif',
  },
];

function expandShorthandHex(value: string) {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function normalizeHexColor(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return expandShorthandHex(trimmed);
  }
  return null;
}

export function parseTextBlockSettings(settings: Record<string, unknown> | null | undefined): TextBlockSettings {
  if (!settings || typeof settings !== 'object') {
    return { fontFamily: null, backgroundColor: null };
  }

  const record = settings as Record<string, unknown>;
  const fontFamily = typeof record.fontFamily === 'string' && record.fontFamily.trim().length > 0 ? record.fontFamily : null;
  const backgroundColor = normalizeHexColor(typeof record.backgroundColor === 'string' ? record.backgroundColor : null);

  return { fontFamily, backgroundColor };
}

export function serializeTextBlockSettings(settings: TextBlockSettingsInput): Record<string, string> | null {
  const fontFamily = typeof settings.fontFamily === 'string' && settings.fontFamily.trim().length > 0 ? settings.fontFamily : null;
  const backgroundColor = normalizeHexColor(settings.backgroundColor);

  const output: Record<string, string> = {};
  if (fontFamily) {
    output.fontFamily = fontFamily;
  }
  if (backgroundColor) {
    output.backgroundColor = backgroundColor;
  }

  return Object.keys(output).length > 0 ? output : null;
}

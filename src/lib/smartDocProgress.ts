export type SmartDocProgress = { fields_total: number; fields_completed: number };

/** PostgREST table-returning functions return an array, including a single row. */
export function smartDocProgressRow(value: unknown): SmartDocProgress | null {
  const row = (Array.isArray(value) ? value[0] : value) as Partial<SmartDocProgress> | null;
  if (!row || !Number.isInteger(row.fields_total) || !Number.isInteger(row.fields_completed)
    || row.fields_total! < 0 || row.fields_completed! < 0 || row.fields_completed! > row.fields_total!) return null;
  return { fields_total: row.fields_total!, fields_completed: row.fields_completed! };
}

export const validSmartDocId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

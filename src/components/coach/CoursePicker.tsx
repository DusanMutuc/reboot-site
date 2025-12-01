'use client';

import { Autocomplete, TextField } from '@mui/material';

type CourseLite = { id: number; title: string | null };

export default function CoursePicker({
  courses, value, onChange, disabled
}: {
  courses: CourseLite[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <Autocomplete
      options={courses}
      getOptionLabel={(c) => c.title ?? 'Untitled'}
      value={courses.find(c => c.id === value) ?? null}
      onChange={(_, v) => onChange(v?.id ?? null)}
      disableClearable={false}
      disabled={disabled}
      sx={{ width: { xs: '100%', sm: 380 } }}
      renderInput={(params) => <TextField {...params} label="Course" size="small" />}
    />
  );
}

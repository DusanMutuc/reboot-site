'use client';

import { Autocomplete, Box, Chip, TextField, Typography, createFilterOptions } from '@mui/material';
import LegendMemberIcon from '@/components/LegendMemberIcon';
import type { StudentOption } from './types';
import { useWorkspaceMemberSearch } from './useWorkspaceMemberSearch';

const filterMembers = createFilterOptions<StudentOption>({
  stringify: (member) => `${member.full_name} ${member.email ?? ''}`,
});

export default function WorkspaceMemberSelector({ students, selectedStudent, loading, error, scopeCopy, onSelect }: {
  students: StudentOption[];
  selectedStudent: StudentOption | null;
  loading: boolean;
  error: string | null;
  scopeCopy: string;
  onSelect: (member: StudentOption, applied: () => void) => void;
}) {
  const search = useWorkspaceMemberSearch(selectedStudent);
  return <Autocomplete
    options={students}
    loading={loading}
    value={selectedStudent}
    inputValue={search.inputValue}
    onInputChange={search.onInputChange}
    clearOnBlur={false}
    onChange={(_event, member) => {
      // Clearing starts a fresh search without unloading the current workspace.
      if (member) onSelect(member, () => search.selectionApplied(member));
    }}
    filterOptions={filterMembers}
    getOptionLabel={(member) => member.full_name}
    isOptionEqualToValue={(member, value) => member.id === value.id}
    renderOption={(props, member) => {
      const { key, ...optionProps } = props;
      return <Box component="li" key={key} {...optionProps} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{member.full_name}</Typography>
          {member.email ? <Typography variant="caption" color="text.secondary">{member.email}</Typography> : null}
        </Box>
        {member.is_legend ? <LegendMemberIcon /> : null}
        {member.pause_started_at ? <Chip label="Paused" size="small" color="info" /> : null}
      </Box>;
    }}
    renderInput={(params) => <TextField {...params} label="Student" placeholder="Search by name or email" error={Boolean(error)} helperText={error ?? scopeCopy} />}
  />;
}

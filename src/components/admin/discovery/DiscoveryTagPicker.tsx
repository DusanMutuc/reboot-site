'use client';

import { Autocomplete, Chip, TextField } from '@mui/material';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';
import { DISCOVERY_CATEGORY_LABELS } from '@/lib/discoveryAdminTypes';

/** Shared closed-vocabulary picker. Text filters options; it never creates tags. */
export default function DiscoveryTagPicker<T extends DiscoveryTag>({
  options, value, onChange, disabled = false, allowInactive = false,
  size = 'medium', hideHelper = false, label = 'Topics', placeholder,
}: {
  options: T[];
  value: T[];
  onChange: (tags: T[]) => void;
  disabled?: boolean;
  allowInactive?: boolean;
  size?: 'small' | 'medium';
  hideHelper?: boolean;
  /** Pass null where a surrounding field group already names it. */
  label?: string | null;
  placeholder?: string;
}) {
  const group = (tag: T) => tag.browse_category
    ? DISCOVERY_CATEGORY_LABELS[tag.browse_category] ?? tag.browse_category : 'No category';
  const choices = options.filter(tag => tag.tag_kind === 'topic' && (allowInactive || tag.is_active !== false))
    .sort((left, right) => group(left).localeCompare(group(right)) || left.name.localeCompare(right.name));
  return <Autocomplete multiple disableCloseOnSelect disabled={disabled} size={size}
    options={choices}
    value={value} onChange={(_, tags) => onChange(tags)}
    isOptionEqualToValue={(left, right) => left.id === right.id}
    getOptionLabel={(tag) => `${tag.name}${tag.is_active === false ? ' (inactive)' : ''}`}
    groupBy={group}
    renderTags={(tags, getTagProps) => tags.map((tag, index) => {
      const { key, ...rest } = getTagProps({ index });
      return <Chip {...rest} key={key} size="small" label={tag.name}
        variant="outlined" />;
    })}
    renderInput={(params) => <TextField {...params} label={label ?? undefined}
      inputProps={{ ...params.inputProps, 'aria-label': label ?? 'Topics' }}
      placeholder={value.length ? undefined : placeholder}
      helperText={hideHelper ? undefined : 'Choose existing topics. Manage topics and synonyms on the Tags tab.'} />} />;
}

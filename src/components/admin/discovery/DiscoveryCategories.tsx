'use client';

import { Chip, Stack, Typography } from '@mui/material';
import { DISCOVERY_CATEGORY_LABELS, inheritedDiscoveryCategories, type DiscoveryTag } from '@/lib/discoveryAdminTypes';

export default function DiscoveryCategories({ tags }: { tags: DiscoveryTag[] }) {
  const categories = inheritedDiscoveryCategories(tags);
  return <Stack spacing={0.75}>
    <Typography variant="caption" color="text.secondary">Categories from these topics</Typography>
    {categories.length ? <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {categories.map(category => <Chip key={category} size="small" label={DISCOVERY_CATEGORY_LABELS[category] ?? category} />)}
    </Stack> : <Typography variant="body2" color="text.secondary">No category yet. Choose a topic with a category to add one.</Typography>}
    <Typography variant="caption" color="text.secondary">Categories are automatic; they do not approve an item for homepage browse.</Typography>
  </Stack>;
}

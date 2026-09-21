import DiscoveryPage from '@/components/discovery/DiscoveryPage';
import { isMemberDiscoveryEnabled } from '@/lib/discoveryFlags';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  if (!isMemberDiscoveryEnabled()) notFound();
  const params = await searchParams;
  return (
    <DiscoveryPage
      initialQuery={Array.isArray(params.q) ? params.q[0] : params.q}
      initialCategory={Array.isArray(params.category) ? params.category[0] : params.category}
    />
  );
}

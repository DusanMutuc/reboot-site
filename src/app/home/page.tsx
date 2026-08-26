import MomentumShell from '@/components/home/MomentumShell';
import { getMomentumHomeData } from '@/lib/momentumHomeData';

export const dynamic = 'force-dynamic';

/** The approved Momentum layout backed by the signed-in member's live data. */
export default async function HomePage() {
  const payload = await getMomentumHomeData();

  return (
    <MomentumShell
      data={payload.data}
      extras={payload.extras}
      meetings={payload.meetings}
      priorities={payload.priorities}
      requiredTraining={payload.requiredTraining}
      trainingStanding={payload.trainingStanding}
      recommended={payload.recommended}
      content={payload.content}
      legendAccess={payload.isLegend ? 'legend' : 'standard'}
      year={payload.year}
    />
  );
}

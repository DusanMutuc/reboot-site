import type { Metadata } from 'next';

import BusinessAuditPreparationForm from '@/components/businessAuditPreparation/BusinessAuditPreparationForm';

export const metadata: Metadata = {
  title: 'Business Audit Preparation | Real Estate Reboot Coaching',
  description: 'Prepare for your upcoming 60 Day Business Audit.',
};

export default function BusinessAuditPreparationPage() {
  return <BusinessAuditPreparationForm />;
}

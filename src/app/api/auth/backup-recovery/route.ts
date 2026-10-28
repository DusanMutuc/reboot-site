import type { NextRequest } from 'next/server';
import { backupEmailRoute } from '@/lib/backupEmailRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) { return backupEmailRoute(request, 'recovery'); }

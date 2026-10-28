import type { NextRequest } from 'next/server';
import { backupEmailRoute } from '@/lib/backupEmailRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) { return backupEmailRoute(request, 'state'); }
export async function POST(request: NextRequest) { return backupEmailRoute(request, 'begin'); }
export async function DELETE(request: NextRequest) { return backupEmailRoute(request, 'remove'); }

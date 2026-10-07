type SelectableMeeting = {
  id: number; date: string; startsAt: string | null; timezone: string; cancelled: boolean;
  session: { id?: string; status: 'open' | 'completed' } | null;
};

export function implementationLocalDate(timezone: string, now = new Date()): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
}

export function selectImplementationMeeting(meetings: SelectableMeeting[], now = new Date(), latestSessionId?: string | null): number | null {
  const eligible = meetings.filter((meeting) => !meeting.cancelled);
  const distance = (meeting: SelectableMeeting) => meeting.startsAt
    ? Math.abs(Date.parse(meeting.startsAt) - now.getTime())
    : Math.abs(Date.parse(`${meeting.date}T12:00:00Z`) - Date.parse(`${implementationLocalDate(meeting.timezone, now)}T12:00:00Z`));
  const nearest = (rows: SelectableMeeting[]) => rows.sort((a, b) => distance(a) - distance(b) || a.date.localeCompare(b.date) || a.id - b.id)[0]?.id ?? null;
  return nearest(eligible.filter((meeting) => meeting.date === implementationLocalDate(meeting.timezone, now)))
    ?? nearest(eligible.filter((meeting) => meeting.session?.status === 'open'
      && (latestSessionId === undefined || meeting.session.id === latestSessionId)))
    ?? nearest(eligible);
}

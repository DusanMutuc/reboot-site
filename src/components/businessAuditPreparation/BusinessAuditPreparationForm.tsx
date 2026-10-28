'use client';

import { useId, useMemo } from 'react';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Link from 'next/link';

import {
  BUSINESS_AUDIT_RATING_OPTIONS, BUSINESS_AUDIT_TEXT_FIELDS, EMPTY_PREPARATION,
  preparationInput, preparationProgress,
} from '@/lib/businessAuditPreparationShared';
import { usePreparationDraft } from './usePreparationDraft';

function formatAuditDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMeetingTime(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(date);
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function BusinessAuditPreparationForm() {
  const { editor, loading, loadError, retryLoad } = usePreparationDraft();
  const payload = editor?.payload ?? null;
  const answers = editor?.values ?? EMPTY_PREPARATION;
  const saving = editor?.submitting ?? false;
  const saveError = editor?.error ?? null;
  const fieldErrors = editor?.fieldErrors ?? {};
  const saved = editor?.submitted && !editor.hasUnsubmittedChanges;
  const progress = preparationProgress(answers);
  const meetingTime = useMemo(
    () => payload && formatMeetingTime(payload.audit.startsAt, payload.audit.timezone),
    [payload],
  );
  const updateText = (field: (typeof BUSINESS_AUDIT_TEXT_FIELDS)[number], value: string) => editor?.edit(field, value);
  const updateRating = (field: 'businessRating' | 'personalRating', value: number | null) => {
    if (value !== null) editor?.edit(field, value);
  };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void editor?.submit();
  };
  const status = editor?.submitting ? 'Submitting answers…'
    : editor?.saving ? 'Saving draft…'
    : editor?.conflict ? 'Review conflicting versions'
    : saveError ? 'Draft could not be saved'
    : editor?.dirty ? 'Unsaved changes'
    : payload?.draft && payload.draft.submittedRevision === payload.draft.revision ? 'All changes submitted'
    : payload?.draft ? `Draft saved ${formatSavedAt(payload.draft.updatedAt)}`
    : payload?.answers ? 'Submitted answers loaded' : 'Your draft saves automatically as you write.';

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        bgcolor: '#f4f8f7',
        backgroundImage:
          'radial-gradient(circle at 8% 2%, rgba(76, 175, 151, 0.16), transparent 28%), radial-gradient(circle at 92% 8%, rgba(42, 42, 42, 0.08), transparent 24%)',
      }}
    >
      <Box sx={{ bgcolor: '#252827', color: 'common.white' }}>
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
          <Box component="nav" aria-label="Back navigation" sx={{ mb: { xs: 3, md: 4 } }}>
            <Button
              component={Link}
              href="/dashboard"
              color="inherit"
              startIcon={<ArrowBackRoundedIcon />}
              sx={{
                px: 1.5,
                py: 0.75,
                border: '1px solid rgba(255,255,255,0.24)',
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.06)',
                fontSize: '1.05rem',
                fontWeight: 800,
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
              }}
            >
              Back to Member Hub
            </Button>
          </Box>
          <Typography
            variant="overline"
            sx={{ color: '#8fddca', fontWeight: 800, letterSpacing: '0.12em' }}
          >
            60 Day Business Review
          </Typography>
          <Typography
            component="h1"
            sx={{
              mt: 0.75,
              fontFamily: 'League Spartan, sans-serif',
              fontSize: { xs: '2.6rem', sm: '3.7rem' },
              fontWeight: 800,
              lineHeight: 0.98,
            }}
          >
            Business Review Preparation
          </Typography>
          <Typography sx={{ mt: 2, maxWidth: 690, color: '#d4e6e1', lineHeight: 1.7 }}>
            Take a few thoughtful minutes to reflect on the past 60 days. Your answers will help
            your coach understand where you are and make the call as useful as possible.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
        {loading ? (
          <Paper elevation={0} sx={{ p: 6, borderRadius: 4, textAlign: 'center' }}>
            <CircularProgress size={34} />
            <Typography sx={{ mt: 2, color: 'text.secondary' }}>
              Loading your Business Review…
            </Typography>
          </Paper>
        ) : loadError || !payload ? (
          <Paper
            elevation={0}
            sx={{ p: { xs: 3, md: 5 }, border: '1px solid', borderColor: 'grey.200', borderRadius: 4 }}
          >
            <Alert severity="warning" sx={{ mb: 3 }}>
              {loadError || 'No upcoming Business Review was found.'}
            </Alert>
            <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
              If you only just booked the meeting, synchronization can take up to one hour. You
              can return using the reminder link once the appointment has been connected.
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button variant="contained" onClick={retryLoad}>Try again</Button>
              <Button component={Link} href="/dashboard">Return to Member Hub</Button>
            </Stack>
          </Paper>
        ) : (
          <Box component="form" noValidate onSubmit={handleSubmit}>
            <Box component="fieldset" disabled={saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, sm: 3 },
                mb: 3,
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 4,
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 2.5,
                      bgcolor: 'primary.50',
                      color: 'primary.main',
                    }}
                  >
                    <CalendarMonthOutlinedIcon />
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      {payload.audit.timing === 'upcoming' ? 'YOUR UPCOMING REVIEW' : 'YOUR LATEST REVIEW'}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                      {formatAuditDate(payload.audit.reviewDate)}
                    </Typography>
                    {meetingTime ? (
                      <Typography variant="body2" color="text.secondary">
                        {meetingTime}
                      </Typography>
                    ) : null}
                  </Box>
                </Stack>

                {payload.answers ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'success.main' }}>
                    <CheckCircleOutlineIcon fontSize="small" />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>
                        {editor?.hasUnsubmittedChanges ? 'Submitted · draft changes not sent' : 'Submitted'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Last submitted {formatSavedAt(payload.answers.submittedAt)}
                      </Typography>
                    </Box>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 800 }}>
                    Not submitted yet
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Alert
              severity="info"
              sx={{
                mb: 3,
                borderRadius: 3,
                '& .MuiAlert-message': { fontSize: '0.95rem', lineHeight: 1.55 },
              }}
            >
              Your draft saves automatically. Complete all eight questions, then submit to share
              your answers with your coach. You can return and submit updated answers later.
            </Alert>

            <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <Typography fontWeight={800}>{progress} of 8 questions answered</Typography>
                <Typography role="status" aria-live="polite" variant="body2" color={saveError ? 'error.main' : 'text.secondary'}>{status}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress / 8 * 100} aria-label={`${progress} of 8 questions answered`} sx={{ mt: 1.5, height: 6, borderRadius: 1 }} />
              {editor?.recovered && <Typography variant="body2" sx={{ mt: 1 }}>Your unfinished answers have been restored in this tab.</Typography>}
              {saveError && !editor?.conflict && <Button type="button" onClick={() => void editor?.retry()} disabled={editor?.saving} sx={{ mt: 1 }}>Retry save</Button>}
            </Paper>
            {editor?.conflict && <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography fontWeight={800}>Your preparation changed in another tab or device.</Typography>
              <Typography variant="body2">Your answers remain in the form below. Compare the saved version before choosing which to keep.</Typography>
              <Box component="details" sx={{ mt: 1 }}>
                <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 700 }}>View the saved answers</Box>
                {Object.entries(preparationInput(editor.conflict.draft?.values ?? editor.conflict.answers)).map(([field, value]) => <Box key={field} sx={{ mt: 1 }}>
                  <Typography variant="caption" fontWeight={800}>{field.replace(/([A-Z])/g, ' $1')}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value === null || value === '' ? '(Not answered)' : value}</Typography>
                </Box>)}
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <Button type="button" onClick={() => editor.resolveConflict(false)}>Use saved answers</Button>
                <Button type="button" onClick={() => editor.resolveConflict(true)}>Keep my answers as the new draft</Button>
              </Stack>
            </Alert>}
            <QuestionSection
              icon={<EmojiEventsOutlinedIcon />}
              eyebrow="01 · Reflect"
              title="Wins & forward movement"
              description="Start with the progress you made, including the small things that may be easy to overlook."
            >
              <QuestionField
                label="How did you move your business forward & did you have any big or small wins?"
                value={answers.businessForwardWins}
                error={fieldErrors.businessForwardWins}
                onChange={(value) => updateText('businessForwardWins', value)}
              />
              <QuestionField
                label="How did you move your personal life forward & did you have any big or small wins?"
                value={answers.personalForwardWins}
                error={fieldErrors.personalForwardWins}
                onChange={(value) => updateText('personalForwardWins', value)}
              />
            </QuestionSection>

            <QuestionSection
              icon={<FlagOutlinedIcon />}
              eyebrow="02 · Identify"
              title="Current challenges"
              description="Give your coach an honest picture of what is creating the most friction right now."
            >
              <QuestionField
                label="What is your greatest business challenge right now?"
                value={answers.greatestBusinessChallenge}
                error={fieldErrors.greatestBusinessChallenge}
                onChange={(value) => updateText('greatestBusinessChallenge', value)}
              />
              <QuestionField
                label="What is your greatest personal challenge right now?"
                value={answers.greatestPersonalChallenge}
                error={fieldErrors.greatestPersonalChallenge}
                onChange={(value) => updateText('greatestPersonalChallenge', value)}
              />
            </QuestionSection>

            <QuestionSection
              icon={<AssignmentTurnedInOutlinedIcon />}
              eyebrow="03 · Prepare"
              title="Make the call count"
              description="Tell us what would make this conversation especially valuable for you."
            >
              <QuestionField
                label="One thing you would be pumped to receive from this call?"
                value={answers.desiredCallOutcome}
                error={fieldErrors.desiredCallOutcome}
                onChange={(value) => updateText('desiredCallOutcome', value)}
              />
              <QuestionField
                label="Do you have any specific topics/situations you want to discuss?"
                value={answers.topicsToDiscuss}
                error={fieldErrors.topicsToDiscuss}
                onChange={(value) => updateText('topicsToDiscuss', value)}
              />
            </QuestionSection>

            <QuestionSection
              icon={<BusinessCenterOutlinedIcon />}
              eyebrow="04 · Rate"
              title="The past 60 days"
              description="Choose the rating that most honestly reflects this period. No 5s or 7s."
            >
              <RatingField
                icon={<BusinessCenterOutlinedIcon fontSize="small" />}
                label="Business: Rate the past 60 days"
                value={answers.businessRating}
                error={fieldErrors.businessRating}
                onChange={(value) => updateRating('businessRating', value)}
              />
              <Divider />
              <RatingField
                icon={<PersonOutlineIcon fontSize="small" />}
                label="Personal: Rate the past 60 days"
                value={answers.personalRating}
                error={fieldErrors.personalRating}
                onChange={(value) => updateRating('personalRating', value)}
              />
            </QuestionSection>

            {saveError ? (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
                {saveError}
              </Alert>
            ) : null}
            {saved ? (
              <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
                Your answers have been submitted to your coach. You can return and submit updates before the meeting.
              </Alert>
            ) : null}

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, sm: 3 },
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 4,
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>
                    {payload.answers ? 'Ready to submit your updates?' : 'Ready to submit?'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {payload.answers ? 'Your coach sees your last submission until you submit these changes.' : 'Drafts stay private until you submit all eight answers.'}
                  </Typography>
                </Box>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
                  disabled={saving || Boolean(editor?.conflict)}
                  sx={{ minWidth: 190, py: 1.25, fontWeight: 900 }}
                >
                  {saving ? 'Submitting…' : payload.answers ? 'Submit updated answers' : 'Submit answers'}
                </Button>
              </Stack>
            </Paper>
            </Box>
          </Box>
        )}
      </Container>
    </Box>
  );
}

function QuestionSection({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      component="section"
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 4 },
        mb: 3,
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 4,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box
          sx={{
            mt: 0.25,
            width: 42,
            height: 42,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 2.5,
            bgcolor: 'rgba(53, 151, 127, 0.12)',
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="overline" color="primary.main" sx={{ fontWeight: 900 }}>
            {eyebrow}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.15 }}>
            {title}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mt: 0.75, lineHeight: 1.65 }}
          >
            {description}
          </Typography>
        </Box>
      </Stack>
      <Stack spacing={3} sx={{ mt: 3.5 }}>
        {children}
      </Stack>
    </Paper>
  );
}

function QuestionField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();

  return (
    <Box>
      <Typography
        component="label"
        htmlFor={inputId}
        sx={{
          display: 'block',
          mb: 1.25,
          maxWidth: 720,
          fontSize: { xs: '1.1rem', sm: '1.3rem' },
          fontWeight: 850,
          lineHeight: 1.4,
          letterSpacing: '-0.01em',
          color: 'text.primary',
        }}
      >
        {label}
        <Box component="span" aria-hidden="true" sx={{ ml: 0.5, color: 'error.main' }}>
          *
        </Box>
      </Typography>
      <TextField
        id={inputId}
        required
        fullWidth
        multiline
        minRows={4}
        placeholder="Share your response…"
        value={value}
        error={Boolean(error)}
        helperText={error || ' '}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 10_000 } }}
        sx={{
          '& .MuiOutlinedInput-root': {
            alignItems: 'flex-start',
            bgcolor: '#fbfdfc',
            borderRadius: 2.5,
          },
          '& .MuiInputBase-inputMultiline': {
            fontSize: '1.1rem',
            lineHeight: 1.65,
          },
        }}
      />
    </Box>
  );
}

function RatingField({
  icon,
  label,
  value,
  error,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  error?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Typography
          sx={{
            fontSize: { xs: '1.1rem', sm: '1.2rem' },
            fontWeight: 850,
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
      </Stack>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        onChange={(_, nextValue: number | null) => onChange(nextValue)}
        aria-label={label}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(4, 1fr)', sm: 'repeat(8, 1fr)' },
          gap: 1,
          '& .MuiToggleButtonGroup-grouped': {
            m: '0 !important',
            border: '1px solid !important',
            borderColor: 'grey.300 !important',
            borderRadius: '12px !important',
            fontWeight: 900,
            py: 1.25,
          },
        }}
      >
        {BUSINESS_AUDIT_RATING_OPTIONS.map((rating) => (
          <ToggleButton key={rating} value={rating} aria-label={`${rating} out of 10`}>
            {rating}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography
        variant="caption"
        color={error ? 'error' : 'text.secondary'}
        sx={{ display: 'block', minHeight: 20, mt: 0.75 }}
      >
        {error || '1 is the lowest and 10 is the highest.'}
      </Typography>
    </Box>
  );
}

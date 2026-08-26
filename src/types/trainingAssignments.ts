export type TrainingCourseOption = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  progressPercent: number;
};

export type TrainingAssignmentSummary = {
  id: number;
  userId: string;
  coachingNoteId: number;
  course: TrainingCourseOption;
  assignedAt: string;
  contextLabel: string | null;
  dueAt: string | null;
};

export type TrainingAssignmentEditorPayload = {
  assignment: TrainingAssignmentSummary | null;
  courses: TrainingCourseOption[];
};

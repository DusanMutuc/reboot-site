// src/app/courses/[courseSlug]/[lessonSlug]/page.tsx
import CourseViewer from '@/components/course/CourseViewer';

type LessonParams = {
  courseSlug: string;
  lessonSlug: string;
};

// We tell TS: "params is an object with those 2 strings."
// At runtime, if Next gives us a Promise, we normalize it below.
export default async function LessonPage({
  params,
}: {
  params: LessonParams;
}) {
  // Next 15 sometimes gives a Promise, sometimes not.
  // We normalize without using `any`.
  const resolved = (await Promise.resolve(params)) as LessonParams;
  const { courseSlug, lessonSlug } = resolved;

  return <CourseViewer courseSlug={courseSlug} lessonSlug={lessonSlug} />;
}

// src/app/courses/[courseSlug]/[lessonSlug]/page.tsx
import CourseViewer from '@/components/course/CourseViewer';

type LessonParams = {
  courseSlug: string;
  lessonSlug: string;
};

export default async function LessonPage({
  params,
}: {
  params: LessonParams | Promise<LessonParams>;
}) {
  const { courseSlug, lessonSlug } = await Promise.resolve(params);

  return <CourseViewer courseSlug={courseSlug} lessonSlug={lessonSlug} />;
}

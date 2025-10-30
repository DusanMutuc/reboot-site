// src/app/courses/[courseSlug]/[lessonSlug]/page.tsx
import CourseViewer from '@/components/course/CourseViewer';

type LessonParams = {
  courseSlug: string;
  lessonSlug: string;
};

export default async function LessonPage({
  params,
}: {
  // 👇 match Next 15’s idea of PageProps: params is a Promise
  params: Promise<LessonParams>;
}) {
  const { courseSlug, lessonSlug } = await params;

  return <CourseViewer courseSlug={courseSlug} lessonSlug={lessonSlug} />;
}

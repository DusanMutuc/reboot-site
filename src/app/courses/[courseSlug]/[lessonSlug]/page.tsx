// src/app/courses/[courseSlug]/[lessonSlug]/page.tsx
import CourseViewer from '@/components/course/CourseViewer';

type LessonParams = {
  courseSlug: string;
  lessonSlug: string;
};

export default async function LessonPage(props: { params: any }) {
  // Next 15 sometimes gives params as a Promise, sometimes as an object.
  const { courseSlug, lessonSlug } = await Promise.resolve(
    props.params as LessonParams
  );

  return <CourseViewer courseSlug={courseSlug} lessonSlug={lessonSlug} />;
}

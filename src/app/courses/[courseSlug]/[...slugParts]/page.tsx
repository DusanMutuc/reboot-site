// src/app/courses/[courseSlug]/[...slugParts]/page.tsx
import CourseViewer from '@/components/course/CourseViewer';

type CourseContentParams = {
  courseSlug: string;
  slugParts: string[];
};

export default async function CourseContentPage({
  params,
}: {
  params: Promise<CourseContentParams>;
}) {
  const { courseSlug, slugParts } = await params;

  return <CourseViewer courseSlug={courseSlug} slugParts={slugParts} />;
}

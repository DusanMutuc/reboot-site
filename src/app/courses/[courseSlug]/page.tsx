import CourseViewer from '@/components/course/CourseViewer';

type CoursePageProps = {
  params: { courseSlug: string };
};

export default function CoursePage({ params }: CoursePageProps) {
  return <CourseViewer courseSlug={params.courseSlug} />;
}

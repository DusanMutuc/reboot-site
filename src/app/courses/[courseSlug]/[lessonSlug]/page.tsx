import CourseViewer from '@/components/course/CourseViewer';

type LessonPageProps = {
  params: { courseSlug: string; lessonSlug: string };
};

export default function LessonPage({ params }: LessonPageProps) {
  return <CourseViewer courseSlug={params.courseSlug} lessonSlug={params.lessonSlug} />;
}

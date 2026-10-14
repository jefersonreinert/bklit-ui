import { DayEditorPage } from "@/components/pages/work/day-editor";

export default async function Page({
  params,
}: {
  params: Promise<{ data: string }>;
}) {
  const { data } = await params;
  return <DayEditorPage dayKey={data} />;
}

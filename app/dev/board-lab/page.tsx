import { notFound } from "next/navigation";
import BoardLab from "@/components/studio/BoardLab";

export const metadata = { title: "Storyboard lab", robots: { index: false, follow: false } };

/** The storyboard review on the Studio lab's fixture cut. Development only: production answers 404. */
export default function BoardLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BoardLab />;
}

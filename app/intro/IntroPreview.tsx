"use client";

import { useRouter } from "next/navigation";
import SociaIntro from "@/components/intro/SociaIntro";

export default function IntroPreview({ next }: { next: string }) {
  const router = useRouter();
  return (
    <div style={{ minHeight: "100dvh", background: "#000" }}>
      <SociaIntro onDone={() => router.replace(next)} />
    </div>
  );
}

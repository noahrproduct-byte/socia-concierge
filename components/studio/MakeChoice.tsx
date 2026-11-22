// The Video editor's first question: animate a video from a prompt, or edit
// clips you filmed. Two large cards with a drawing each; both are links.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function MakeChoice({ modeTabs }: { modeTabs: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Content Studio" sub="Pick a tool." />
      {modeTabs}
      <div className="stu-pick">
        <Link href="/studio?mode=animate">
          <svg className="stu-art" viewBox="0 0 320 150" aria-hidden focusable="false">
            <rect className="a-soft" x="126" y="16" width="68" height="118" rx="10" />
            <path className="a-line" d="M142 46h36M142 62h26" />
            <rect className="a-fill" x="142" y="82" width="10" height="34" rx="3" />
            <rect className="a-fill" x="158" y="96" width="10" height="20" rx="3" />
            <rect className="a-fill" x="174" y="72" width="10" height="44" rx="3" />
            <path className="a-accent" d="M40 75h56M86 65l10 10l-10 10M224 75h56M270 65l10 10l-10 10" />
            <path className="a-line" d="M30 44h44M30 58h30M246 44h44M246 58h30" />
          </svg>
          <b>Animate a video</b>
          <p>Say what it is about. Add a video to copy if you have one. SOCIA writes and animates it, no filming.</p>
          <span className="stu-pick-go">Start with a prompt <ArrowRight aria-hidden /></span>
        </Link>
        <Link href="/studio?mode=edit">
          <svg className="stu-art" viewBox="0 0 320 150" aria-hidden focusable="false">
            <rect className="a-soft" x="40" y="26" width="52" height="92" rx="8" />
            <rect className="a-soft" x="104" y="26" width="52" height="92" rx="8" />
            <rect className="a-soft" x="168" y="26" width="52" height="92" rx="8" />
            <rect className="a-soft" x="232" y="26" width="52" height="92" rx="8" />
            <path className="a-line" d="M60 64l14 8l-14 8zM124 64l14 8l-14 8zM188 64l14 8l-14 8zM252 64l14 8l-14 8z" />
            <path className="a-accent" d="M40 134h244M98 126v16M162 126v16M226 126v16" />
          </svg>
          <b>Video editor</b>
          <p>Drop in the clips you filmed. SOCIA cuts them, adds captions and motion effects, or you edit them yourself.</p>
          <span className="stu-pick-go">Drop in clips <ArrowRight aria-hidden /></span>
        </Link>
      </div>
    </>
  );
}

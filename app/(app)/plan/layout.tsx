import PlanTabs from "@/components/PlanTabs";

// Plan holds the weekly Content Plan (/plan) and the Calendar
// (/plan/calendar); the switch between them stays put while the page swaps.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlanTabs />
      {children}
    </>
  );
}

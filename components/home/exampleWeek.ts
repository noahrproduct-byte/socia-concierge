// One example week for Northside Roasters, a fictional café, shared by the
// hero, the Today card, the Content Plan, Content Studio and the approvals
// list so every screen agrees. Today is Tuesday, 27 October.
export const WEEK: { day: string; title: string; why: string; when: string; where: string; status: string; done?: boolean }[] = [
  {
    day: "Mon",
    title: "Behind the counter: the 6 AM open",
    why: "Reel, educational. Your Reels got 1.8× your median views over the last 90 days.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Published",
    done: true,
  },
  {
    day: "Tue",
    title: "Three ways to order that aren't on the menu",
    why: "Reel, educational. 6:30 PM sits in your best window, 5 to 7 PM: 1.6× your median views over 90 days.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Scheduled",
    done: true,
  },
  {
    day: "Wed",
    title: "The roast we almost didn't sell",
    why: "Carousel, story. Two of your three competitors post one every week; you have posted none in 90 days.",
    when: "12:00 PM",
    where: "Instagram and Facebook",
    status: "Needs approval",
  },
  {
    day: "Fri",
    title: "Pour from higher first: a latte at home, part 2",
    why: "Reel, follow-up. Sunday's latte Reel has 2.4× your median views at the same age.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Draft",
  },
  {
    day: "Sun",
    title: "Ask the regulars",
    why: "Post, community. Posts that asked a question got 2.1× your median replies over 90 days.",
    when: "10:00 AM",
    where: "Instagram",
    status: "Needs approval",
  },
];


// One example week for Dani Reyes, a fictional fitness coach, shared by the
// hero, the Today card, the Content Plan and the approvals list so every
// screen agrees. Today is Tuesday, 27 October.
export const WEEK: { day: string; title: string; why: string; when: string; where: string; status: string; done?: boolean; img: string }[] = [
  {
    day: "Mon",
    img: "/landing/creators/fitness-class.jpg",
    title: "Behind the scenes: my 6 AM class",
    why: "Reel, behind the scenes. Your Reels got 1.8× your median views over the last 90 days.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Published",
    done: true,
  },
  {
    day: "Tue",
    img: "/landing/creators/fitness-stretch.jpg",
    title: "Three warm-ups people skip",
    why: "Reel, educational. 6:30 PM sits in your best window, 5 to 7 PM: 1.6× your median views over 90 days.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Scheduled",
    done: true,
  },
  {
    day: "Wed",
    img: "/landing/creators/fitness-mealprep.jpg",
    title: "What I eat on a training day",
    why: "Carousel, story. Two of your three competitors post one every week; you have posted none in 90 days.",
    when: "12:00 PM",
    where: "Instagram and YouTube",
    status: "Needs approval",
  },
  {
    day: "Fri",
    img: "/landing/creators/fitness-squat.jpg",
    title: "Three cues for a cleaner squat, part 2",
    why: "Reel, follow-up. Sunday's squat Reel has 2.4× your median views at the same age.",
    when: "6:30 PM",
    where: "Instagram",
    status: "Draft",
  },
  {
    day: "Sun",
    img: "/landing/creators/fitness-gym.jpg",
    title: "Ask the class",
    why: "Post, community. Posts that asked a question got 2.1× your median replies over 90 days.",
    when: "10:00 AM",
    where: "Instagram",
    status: "Needs approval",
  },
];

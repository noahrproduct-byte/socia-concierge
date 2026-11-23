// A drawing of a storyboard beat: the kind of camera move it describes (lib/shotMove.ts), a phone frame,
// a figure or a screen and an arrow for the move, and, along the bottom of the frame, what is in the shot
// and any amount the beat states (lib/shotProps.ts), so each idea's frames look like that idea. Read only from
// the beat's own words; hidden from screen readers, since those words say what happens.
import {
  AppWindow, Banknote, BookOpen, CakeSlice, CalendarDays, Camera, Car, ChartColumn, Clock, Coffee, DoorOpen, Dumbbell,
  Flame, House, LampDesk, LayoutGrid, Laptop, MessageCircle, Mic, Pizza, Scissors, ScrollText, Shirt, Smartphone, Store,
  Tag, Users, UtensilsCrossed, type LucideIcon,
} from "lucide-react";
import type { ShotMove } from "@/lib/shotMove";
import type { ShotProp } from "@/lib/shotProps";

const PROP_ICON: Record<ShotProp, LucideIcon> = {
  laptop: Laptop, phone: Smartphone, desk: LampDesk, door: DoorOpen, calendar: CalendarDays, price: Tag, chart: ChartColumn,
  feed: LayoutGrid, pizza: Pizza, coffee: Coffee, food: UtensilsCrossed, oven: Flame, gym: Dumbbell, car: Car, store: Store,
  menu: ScrollText, money: Banknote, camera: Camera, mic: Mic, book: BookOpen, clothes: Shirt, hair: Scissors, people: Users,
  app: AppWindow, message: MessageCircle, clock: Clock, cake: CakeSlice, home: House,
};

const Person = ({ x, y, s = 1, faint = false }: { x: number; y: number; s?: number; faint?: boolean }) => (
  <g className={faint ? "sd-faint" : "sd-ink"}>
    <circle cx={x} cy={y} r={7 * s} />
    <path d={`M${x} ${y + 7 * s}v${22 * s}M${x - 11 * s} ${y + 16 * s}h${22 * s}M${x} ${y + 29 * s}l${-9 * s} ${18 * s}M${x} ${y + 29 * s}l${9 * s} ${18 * s}`} />
  </g>
);
const Corners = () => <path className="sd-move" d="M22 14h10M22 14v10M98 14h-10M98 14v10M22 162h10M22 162v-10M98 162h-10M98 162v-10" />;

const ART: Record<ShotMove, React.ReactNode> = {
  walk: (<><Person x={42} y={64} s={0.7} faint /><Person x={72} y={76} s={1.1} /><path className="sd-move" d="M40 148h40M72 140l8 8l-8 8" /></>),
  tilt: (<><Person x={60} y={70} /><path className="sd-move" d="M96 40v72M88 104l8 8l8-8" /></>),
  pan: (<><Person x={60} y={66} /><path className="sd-move" d="M28 148h64M84 140l8 8l-8 8" /></>),
  push: (<><Person x={60} y={62} s={1.2} /><path className="sd-move" d="M26 20l14 14M94 20l-14 14M26 156l14-14M94 156l-14-14" /></>),
  pull: (<><Person x={60} y={72} s={0.8} /><path className="sd-move" d="M40 34l-14-14M80 34l14-14M40 142l-14 14M80 142l14 14M26 28v-8h8M94 28v-8h-8M26 148v8h8M94 148v8h-8" /></>),
  screen: (<>{[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} className="sd-tile" x={26 + (i % 2) * 30} y={22 + Math.floor(i / 2) * 44} width={25} height={38} rx={3} />)}<path className="sd-move" d="M100 124V56M92 64l8-8l8 8" /></>),
  cuts: (<>{[0, 1, 2, 3].map((i) => <rect key={i} className={i === 3 ? "sd-tile sd-on" : "sd-tile"} x={22 + i * 8} y={30 + i * 12} width={52} height={72} rx={6} />)}</>),
  close: (<><g className="sd-ink"><circle cx={60} cy={84} r={30} /><path d="M48 78h.1M72 78h.1M50 96q10 8 20 0" /></g><Corners /></>),
  text: (<><g className="sd-ink"><path d="M32 70h56M32 88h44M32 106h50" /></g><Corners /></>),
  handheld: (<><Person x={60} y={66} /><path className="sd-move" d="M26 150q8-10 16 0t16 0t16 0t16 0" /></>),
  still: (<><Person x={60} y={62} s={1.1} /><Corners /></>),
};

export default function ShotDiagram({ move, props = [], amount = null }: { move: ShotMove; props?: ShotProp[]; amount?: string | null }) {
  const has = props.length > 0 || Boolean(amount);
  return (
    <span className={`sd-wrap${has ? " has-props" : ""}`} aria-hidden>
      <svg className="sd" viewBox="0 0 120 176" focusable="false">
        <rect className="sd-phone" x={14} y={6} width={92} height={164} rx={12} />
        {ART[move]}
      </svg>
      {has && (
        <span className="sd-props">
          {props.map((p) => { const Icon = PROP_ICON[p]; return <Icon key={p} size={22} strokeWidth={1.8} />; })}
          {amount && <b className="sd-amount">{amount}</b>}
        </span>
      )}
    </span>
  );
}

"use client";

// The account row at the foot of the sidebar (and in the phone sheet): who is
// signed in and on which plan, opening appearance, Settings and Log out.

import { Check, ChevronsUpDown, LogOut, Moon, Settings, Sun, SunMoon } from "lucide-react";
import { useTheme, type Appearance } from "@/components/ThemeProvider";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuSeparator, MenuTrigger } from "@/components/system";
import { PLANS, type PlanId } from "@/lib/plans";

const APPEARANCES: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: SunMoon },
];

export default function AccountMenu({ email, plan = "free" }: { email?: string | null; plan?: PlanId }) {
  const { appearance, setAppearance, ready } = useTheme();
  const name = (email?.split("@")[0] ?? "account").replace(/[._-]+/g, " ");
  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <Menu>
      <MenuTrigger className="s-account" aria-label={`Account: ${name}, ${PLANS[plan].name} plan`}>
        <span className="s-avatar" aria-hidden>
          {initial}
        </span>
        <span className="s-account-meta">
          <span className="s-account-name">{name}</span>
          <span className="s-account-plan">{PLANS[plan].name} plan</span>
        </span>
        <ChevronsUpDown aria-hidden />
      </MenuTrigger>
      <MenuContent side="top" align="start" style={{ minWidth: 208 }}>
        <MenuGroup label="Appearance">
          {APPEARANCES.map(({ value, label, Icon }) => (
            <MenuItem key={value} closeOnClick={false} onClick={() => setAppearance(value)} end={ready && appearance === value ? <Check aria-label="Selected" /> : undefined}>
              <Icon aria-hidden />
              <span>{label}</span>
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem href="/settings">
          <Settings aria-hidden />
          <span>Settings</span>
        </MenuItem>
        <MenuSeparator />
        <form action="/auth/signout" method="post">
          <MenuItem render={<button type="submit" />}>
            <LogOut aria-hidden />
            <span>Log out</span>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}

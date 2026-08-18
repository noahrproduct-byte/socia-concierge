"use client";

import { useState } from "react";
import { Users2, ChevronDown, Check, Camera, Music2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ACCOUNTS = [
  { id: "all", short: "All Accounts", label: "All Accounts", icon: <Users2 size={15} /> },
  { id: "ig", short: "Instagram", label: "@yourbrand · Instagram", icon: <Camera size={15} /> },
  { id: "tt", short: "TikTok", label: "@yourbrand · TikTok", icon: <Music2 size={15} /> },
];

export default function AccountSwitcher() {
  const [val, setVal] = useState("all");
  const current = ACCOUNTS.find((a) => a.id === val)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="pill-btn" aria-label="Switch account">
        {current.icon}
        {current.short}
        <ChevronDown size={14} className="drop-chev" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ACCOUNTS.map((a) => (
            <DropdownMenuItem key={a.id} onClick={() => setVal(a.id)} className="gap-2">
              {a.icon}
              <span className="flex-1">{a.label}</span>
              {a.id === val && <Check size={14} />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

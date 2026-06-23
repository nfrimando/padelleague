"use client";

import Link from "next/link";
import { Swords, CalendarRange, ChevronRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import MembersOnlyGate from "@/components/MembersOnlyGate";

const TOOLS = [
  {
    href: "/tools/duel",
    icon: Swords,
    title: "Duel Roulette",
    desc: "Opt into the pool, set a rating range, and generate a fair 2v2 with the best schedule alignment.",
  },
  {
    href: "/tools/find",
    icon: CalendarRange,
    title: "Find Players",
    desc: "A weekly heatmap of everyone's availability. Filter by rating and spot the busiest play windows.",
  },
];

export default function ToolsPage() {
  return (
    <MembersOnlyGate>
      {() => (
        <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
          <SiteHeader />
          <div className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
            <header className="mb-6">
              <h1 className="text-2xl font-black italic uppercase tracking-tighter">
                Player Tools
              </h1>
              <p className="text-white/50 text-sm mt-1">
                Members-only utilities for finding games and fair matchups.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="group flex flex-col gap-3 border border-white/10 hover:border-[#00C8DC]/40 bg-[#162032] hover:bg-[#1a2540] rounded-3xl p-5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#00C8DC]/10 border border-[#00C8DC]/20 text-[#00C8DC]">
                        <Icon size={18} />
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-[#687FA3] group-hover:text-white transition-colors"
                      />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">
                        {tool.title}
                      </h2>
                      <p className="text-xs text-[#687FA3] mt-1 leading-relaxed">
                        {tool.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </MembersOnlyGate>
  );
}

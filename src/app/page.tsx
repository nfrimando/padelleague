import { supabase } from "@/lib/supabase";
import { CarouselSlide } from "@/lib/types";
import HeroCarousel from "@/components/HeroCarousel";
import Link from "next/link";

async function getCarouselSlides(): Promise<CarouselSlide[]> {
  try {
    const { data } = await supabase
      .from("carousel_slides")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    return data || [];
  } catch {
    return [];
  }
}

async function getStats() {
  try {
    const [players, matches, seasons] = await Promise.all([
      supabase.from("players").select("player_id", { count: "exact", head: true }),
      supabase.from("matches").select("match_id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("matches").select("season_id").order("season_id", { ascending: false }).limit(1),
    ]);
    return {
      players: players.count ?? 0,
      matches: matches.count ?? 0,
      activeSeason: seasons.data?.[0]?.season_id ?? "S8",
    };
  } catch {
    return { players: 0, matches: 0, activeSeason: "S8" };
  }
}

export default async function HomePage() {
  const [slides, stats] = await Promise.all([getCarouselSlides(), getStats()]);

  const statTiles = [
    { label: "Players", value: stats.players || "—" },
    { label: "Matches Played", value: stats.matches || "—" },
    { label: "Active Season", value: stats.activeSeason },
    { label: "Match Types", value: "4" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-0 space-y-8 pb-12">
      {/* Hero Carousel — full bleed */}
      <div className="-mx-4">
        <HeroCarousel slides={slides} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statTiles.map((t) => (
          <div
            key={t.label}
            className="bg-surface border border-bdr rounded-xl p-4 text-center"
          >
            <div className="font-display text-3xl text-accent italic">
              {t.value}
            </div>
            <div className="text-xs text-sec mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/players"
          className="group bg-surface border border-bdr hover:border-accent/50 rounded-xl p-6 flex items-center gap-4 transition-colors"
        >
          <div className="w-12 h-12 bg-accent-dim rounded-xl flex items-center justify-center text-2xl">
            👥
          </div>
          <div>
            <div className="font-semibold text-white group-hover:text-accent transition-colors">
              Players
            </div>
            <div className="text-xs text-sec mt-0.5">
              Browse all league members
            </div>
          </div>
        </Link>

        <Link
          href="/leaderboard"
          className="group bg-surface border border-bdr hover:border-accent/50 rounded-xl p-6 flex items-center gap-4 transition-colors"
        >
          <div className="w-12 h-12 bg-accent-dim rounded-xl flex items-center justify-center text-2xl">
            🏆
          </div>
          <div>
            <div className="font-semibold text-white group-hover:text-accent transition-colors">
              Leaderboard
            </div>
            <div className="text-xs text-sec mt-0.5">
              Rankings, ratings, and stats
            </div>
          </div>
        </Link>
      </div>

      {/* League benefits */}
      <div className="border border-dashed border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            League Member Benefits
          </h2>
          <span className="text-xs bg-gold-bg text-gold border border-gold/30 px-2 py-0.5 rounded font-mono">
            Coming Soon
          </span>
        </div>
        <p className="text-xs text-muted mb-4">Powered by our sponsors</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: "🎾", title: "Gear Discounts", desc: "Exclusive deals on padel equipment" },
            { icon: "💪", title: "Health & Wellness", desc: "Partner gym and physio access" },
            { icon: "🏟️", title: "Court Access", desc: "Priority court booking for members" },
          ].map((b) => (
            <div
              key={b.title}
              className="bg-elevated rounded-lg p-4 opacity-60"
            >
              <div className="text-2xl mb-2">{b.icon}</div>
              <div className="text-sm font-medium text-white">{b.title}</div>
              <div className="text-xs text-sec mt-1">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

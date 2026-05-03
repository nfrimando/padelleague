"use client";

import Link from "next/link";
import { MatchWithTeams } from "@/lib/types";
import { playerLabel } from "@/lib/utils";

type Team = MatchWithTeams["teams"][number];
type Player = Team["player_1"];

// ─── Shared primitives ────────────────────────────────────────────────────────

function PlayerAvatar({
  player,
  label,
  sizeClass,
  textClass,
}: {
  player: Player;
  label: string;
  sizeClass: string;
  textClass: string;
}) {
  if (player?.image_link) {
    return (
      <img
        src={player.image_link}
        alt={label}
        className={`${sizeClass} rounded-full object-cover border border-slate-200 dark:border-slate-700`}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${sizeClass} items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 ${textClass} font-semibold text-slate-500 dark:text-slate-400`}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

function PlayerLink({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
    >
      {children}
    </Link>
  );
}

function playerHref(player: Player): string | null {
  return player?.player_id
    ? `/players/${encodeURIComponent(String(player.player_id))}`
    : null;
}

// ─── Variant: desktop-text ────────────────────────────────────────────────────
// Replaces teamLineWithWinner. Used in the desktop calendar cell pill.

function DesktopTextLine({
  team,
  isWinner,
  className,
  withImages,
}: {
  team: Team | undefined;
  isWinner: boolean;
  className: string;
  withImages: boolean;
}) {
  if (!team) return <span className={className}>TBA</span>;

  const firstName = playerLabel(team.player_1);
  const secondName = playerLabel(team.player_2);
  const firstHref = playerHref(team.player_1);
  const secondHref = playerHref(team.player_2);

  const renderPlayer = (href: string | null, player: Player, label: string) => {
    const content = withImages ? (
      <span className="inline-flex items-center gap-1 align-middle">
        <PlayerAvatar
          player={player}
          label={label}
          sizeClass="h-4 w-4"
          textClass="text-[9px]"
        />
        <span>{label}</span>
      </span>
    ) : (
      <span>{label}</span>
    );
    return <PlayerLink href={href}>{content}</PlayerLink>;
  };

  return (
    <div className={className}>
      {isWinner ? "🏆 " : ""}
      {renderPlayer(firstHref, team.player_1, firstName)}
      <span> / </span>
      {renderPlayer(secondHref, team.player_2, secondName)}
    </div>
  );
}

// ─── Variant: mobile ──────────────────────────────────────────────────────────
// Replaces mobileTeamInline. Used in the mobile agenda row.

function MobileLine({
  team,
  isWinner,
  side,
}: {
  team: Team | undefined;
  isWinner: boolean;
  side: "left" | "right";
}) {
  const sideJustifyClass = side === "left" ? "justify-end" : "justify-start";

  if (!team) {
    return (
      <span className={`flex w-full min-w-0 ${sideJustifyClass}`}>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span>TBA</span>
          <span
            aria-hidden="true"
            className={`w-4 text-center text-sm leading-none ${isWinner ? "" : "invisible"}`}
          >
            🏆
          </span>
        </span>
      </span>
    );
  }

  const firstName = playerLabel(team.player_1);
  const secondName = playerLabel(team.player_2);
  const href = playerHref(team.player_1);
  const label = `${firstName} / ${secondName}`;

  const avatars = (
    <span className="inline-flex shrink-0 items-center -space-x-1">
      <PlayerAvatar
        player={team.player_1}
        label={firstName}
        sizeClass="h-5 w-5"
        textClass="text-[10px]"
      />
      <PlayerAvatar
        player={team.player_2}
        label={secondName}
        sizeClass="h-5 w-5"
        textClass="text-[10px]"
      />
    </span>
  );

  const trophy = (
    <span
      aria-hidden="true"
      className={`w-4 text-center text-sm leading-none ${isWinner ? "" : "invisible"}`}
    >
      🏆
    </span>
  );

  const labelNode = href ? (
    <Link
      href={href}
      className="block hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
    >
      {label}
    </Link>
  ) : (
    <span className="block">{label}</span>
  );

  return (
    <span className={`flex w-full min-w-0 ${sideJustifyClass}`}>
      <span
        className={`grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 text-xs font-medium ${
          isWinner
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {side === "left" ? trophy : avatars}
        <span className="min-w-0 truncate">{labelNode}</span>
        {side === "left" ? avatars : trophy}
      </span>
    </span>
  );
}

// ─── Variant: preview-block ───────────────────────────────────────────────────
// Replaces renderTeamBlock + renderPlayerLine. Used in MatchPreviewFull.

function PreviewBlock({
  team,
  isWinner,
  side,
}: {
  team: Team | undefined;
  isWinner: boolean;
  side: "left" | "right";
}) {
  const isLeftSide = side === "left";
  const textAlignClass = isLeftSide ? "text-right" : "text-left";
  const rowJustifyClass = isLeftSide
    ? "flex justify-end"
    : "flex justify-start";

  if (!team) {
    return (
      <div className={`min-w-0 flex-1 ${textAlignClass}`}>
        <div className="text-xs text-slate-500 dark:text-slate-400">TBA</div>
      </div>
    );
  }

  const p1Name = playerLabel(team.player_1);
  const p2Name = playerLabel(team.player_2);
  const p1Href = playerHref(team.player_1);
  const p2Href = playerHref(team.player_2);

  const renderPlayerRow = (
    href: string | null,
    player: Player,
    label: string,
  ) => {
    const avatar = (
      <PlayerAvatar
        player={player}
        label={label}
        sizeClass="h-8 w-8"
        textClass="text-xs"
      />
    );
    const labelNode = (
      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">
        {label}
      </span>
    );
    const content = (
      <span className="flex min-w-0 max-w-full items-center gap-1.5 align-middle">
        {isLeftSide ? labelNode : avatar}
        {isLeftSide ? avatar : labelNode}
      </span>
    );
    if (!href) return content;
    return (
      <Link
        href={href}
        className="block min-w-0 max-w-full hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 rounded"
      >
        {content}
      </Link>
    );
  };

  return (
    <div
      className={`min-w-0 flex-1 rounded-md p-1 text-[11px] leading-tight text-slate-800 dark:text-slate-100 ${textAlignClass} ${
        isWinner
          ? "bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-700"
          : ""
      }`}
    >
      <div className="space-y-1">
        <div className={rowJustifyClass}>
          {renderPlayerRow(p1Href, team.player_1, p1Name)}
        </div>
        <div className={rowJustifyClass}>
          {renderPlayerRow(p2Href, team.player_2, p2Name)}
        </div>
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export type TeamPlayerLineVariant = "desktop-text" | "mobile" | "preview-block";

interface TeamPlayerLineProps {
  team: Team | undefined;
  isWinner: boolean;
  variant: TeamPlayerLineVariant;
  /** "mobile" and "preview-block" variants only */
  side?: "left" | "right";
  /** "desktop-text" variant only */
  className?: string;
  /** "desktop-text" variant only */
  withImages?: boolean;
}

export function TeamPlayerLine({
  team,
  isWinner,
  variant,
  side = "left",
  className = "",
  withImages = false,
}: TeamPlayerLineProps) {
  if (variant === "mobile") {
    return <MobileLine team={team} isWinner={isWinner} side={side} />;
  }
  if (variant === "preview-block") {
    return <PreviewBlock team={team} isWinner={isWinner} side={side} />;
  }
  return (
    <DesktopTextLine
      team={team}
      isWinner={isWinner}
      className={className}
      withImages={withImages}
    />
  );
}

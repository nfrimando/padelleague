import type { EventSignupStatus } from "@/lib/eventSignupStatus";

export type EventAccess = {
  found: boolean;
  canManage: boolean;
  registered: boolean;
  paid: boolean;
  signupId: string | null;
  signupStatus: EventSignupStatus | null;
  paymentRequired: boolean;
  canViewInside: boolean;
};

export type DivisionPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

export type DivisionTeam = {
  id: string;
  division: number;
  team_number: number;
  player_1: DivisionPlayer;
  player_2: DivisionPlayer;
};

export type EventInsideResponse = {
  access: EventAccess;
  details?: { information: string | null; event_url: string | null } | null;
  teams?: DivisionTeam[];
  matches?: { match_id: number; status: string; date_local: string | null }[];
};

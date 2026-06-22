export type EventSignupStatus =
  | "applied"
  | "pending_payment"
  | "accepted"
  | "waitlisted"
  | "cancelled";

export function signupStatusLabel(status: EventSignupStatus): string {
  switch (status) {
    case "applied":
      return "Applied — Pending Approval";
    case "pending_payment":
      return "Payment Required";
    case "accepted":
      return "Accepted";
    case "waitlisted":
      return "Waitlisted";
    case "cancelled":
      return "Cancelled";
  }
}

export function signupStatusBadgeClass(status: EventSignupStatus): string {
  switch (status) {
    case "applied":
      return "bg-amber-500/10 border-amber-500/30 text-amber-300";
    case "pending_payment":
      return "bg-orange-500/10 border-orange-500/30 text-orange-300";
    case "accepted":
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "waitlisted":
      return "bg-amber-500/10 border-amber-500/30 text-amber-300";
    case "cancelled":
      return "bg-red-500/10 border-red-500/30 text-red-300";
  }
}

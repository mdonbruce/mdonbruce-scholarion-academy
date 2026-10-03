/** Admin-configurable commerce settings. Every price is a sandbox placeholder (Spec §2.1). */
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const commerceConfig = {
  get currency() {
    return process.env.CURRENCY ?? "USD";
  },
  get programMonthly() {
    return num("PRICE_PROGRAM_MONTHLY", 45);
  },
  get plusMonthly() {
    return num("PRICE_PLUS_MONTHLY", 55);
  },
  get plusAnnual() {
    return num("PRICE_PLUS_ANNUAL", 420);
  },
  get trialDays() {
    return num("TRIAL_DAYS", 7);
  },
  get refundDays() {
    return num("REFUND_DAYS", 14);
  },
  /** Scholarion for Teams: price per seat per year (placeholder). */
  get seatAnnual() {
    return num("PRICE_SEAT_ANNUAL", 300);
  },
  get trialReminderDays() {
    return num("TRIAL_REMINDER_DAYS", 2);
  },
  /** One-time prices by product type. */
  oneTime(type: string, hours: number): number {
    if (type === "guided_project") return 15;
    if (type === "live_program") return Math.round(hours * 30);
    return Math.max(49, Math.round(hours * 1.5));
  },
  placeholder: true,
};

export function publicUrl(): string {
  return (process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function money(amount: number, currency = commerceConfig.currency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

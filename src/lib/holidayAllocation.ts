import { supabase } from "@/integrations/supabase/client";
import { calculateApprovedHolidayUsage } from "@/lib/holidayUsage";

export type AllocationBucket = "annual" | "sick" | "personal" | null;

export interface AllocationCheck {
  bucket: AllocationBucket;        // which bucket is deducted from
  deducts: boolean;                 // whether this absence type deducts
  entitlement: number;              // total days allocated
  used: number;                     // days already used
  remaining: number;                // entitlement - used
  requested: number;                // total_days for this request
  remainingAfter: number;           // remaining - requested
  hasEnough: boolean;               // true if remaining >= requested OR !deducts
  bucketLabel: string;
  year: number;
}

const BUCKET_MAP: Record<string, AllocationBucket> = {
  annual_leave: "annual",
  sick_leave: "sick",
  compassionate_leave: "personal",
  study_leave: "personal",
};

const BUCKET_LABELS: Record<NonNullable<AllocationBucket>, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  personal: "Personal Days",
};

/**
 * Fetch remaining allocation for a holiday request to decide whether
 * an approver should be allowed to approve it.
 */
export async function checkHolidayAllocation(req: {
  user_id?: string | null;
  system_user_id?: string | null;
  absence_type: string;
  start_date: string;
  total_days?: number | null;
}): Promise<AllocationCheck> {
  const year = new Date(req.start_date).getFullYear();
  const requested = Number(req.total_days ?? 0);
  const bucket = BUCKET_MAP[req.absence_type] ?? null;
  const deducts = bucket !== null;

  // Non-deducting leave types (maternity, paternity, unpaid, public_holiday) — always allowed.
  if (!deducts) {
    return {
      bucket: null,
      deducts: false,
      entitlement: 0,
      used: 0,
      remaining: 0,
      requested,
      remainingAfter: 0,
      hasEnough: true,
      bucketLabel: "Non-deducting",
      year,
    };
  }

  // Look up entitlement row for either user_id or system_user_id.
  const ids = [req.user_id, req.system_user_id].filter(Boolean) as string[];
  let entitlement = 0;
  let used = 0;

  if (ids.length > 0) {
    const { data } = await supabase
      .from("holiday_entitlements")
      .select(
        "annual_leave_entitlement,annual_leave_used,sick_leave_entitlement,sick_leave_used,personal_days_entitlement,personal_days_used,carried_over"
      )
      .in("user_id", ids)
      .eq("year", year)
      .maybeSingle();

    if (data) {
      let requestsQuery = supabase
        .from("holiday_requests")
        .select("user_id,system_user_id,absence_type,start_date,status,total_days")
        .eq("status", "approved")
        .gte("start_date", `${year}-01-01`)
        .lt("start_date", `${year + 1}-01-01`);

      if (req.user_id && req.system_user_id) {
        requestsQuery = requestsQuery.or(`user_id.eq.${req.user_id},system_user_id.eq.${req.system_user_id}`);
      } else if (req.user_id) {
        requestsQuery = requestsQuery.eq("user_id", req.user_id);
      } else if (req.system_user_id) {
        requestsQuery = requestsQuery.eq("system_user_id", req.system_user_id);
      }

      const { data: requestRows } = await requestsQuery;

      const usage = calculateApprovedHolidayUsage(requestRows ?? [], year, {
        authUserId: req.user_id ?? null,
        systemUserId: req.system_user_id ?? null,
      });

      if (bucket === "annual") {
        entitlement = Number(data.annual_leave_entitlement ?? 0) + Number(data.carried_over ?? 0);
        used = usage.annual;
      } else if (bucket === "sick") {
        entitlement = Number(data.sick_leave_entitlement ?? 0);
        used = usage.sick;
      } else if (bucket === "personal") {
        entitlement = Number(data.personal_days_entitlement ?? 0);
        used = usage.personal;
      }
    } else {
      // No row yet — fall back to defaults that the approve RPC would auto-seed.
      if (bucket === "annual") {
        const { data: cu } = await supabase
          .from("comprehensive_users")
          .select("annual_leave_entitlement")
          .or(`auth_user_id.eq.${req.user_id},id.eq.${req.system_user_id}`)
          .maybeSingle();
        entitlement = Number(cu?.annual_leave_entitlement ?? 25);
      } else if (bucket === "sick") {
        entitlement = 10;
      } else if (bucket === "personal") {
        entitlement = 5;
      }
    }
  }

  const remaining = Math.max(0, entitlement - used);
  const remainingAfter = entitlement - used - requested;

  return {
    bucket,
    deducts: true,
    entitlement,
    used,
    remaining,
    requested,
    remainingAfter,
    hasEnough: remainingAfter >= 0,
    bucketLabel: BUCKET_LABELS[bucket],
    year,
  };
}

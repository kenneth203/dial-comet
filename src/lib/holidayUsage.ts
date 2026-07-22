type HolidayRequestLike = {
  absence_type?: string | null;
  start_date?: string | null;
  status?: string | null;
  total_days?: number | string | null;
  user_id?: string | null;
  system_user_id?: string | null;
};

export interface HolidayUsageSummary {
  annual: number;
  sick: number;
  personal: number;
}

const PERSONAL_ABSENCE_TYPES = new Set(["compassionate_leave", "study_leave"]);

function toNumber(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function calculateApprovedHolidayUsage(
  requests: HolidayRequestLike[],
  year: number,
  userMatch?: { authUserId?: string | null; systemUserId?: string | null }
): HolidayUsageSummary {
  return requests.reduce<HolidayUsageSummary>(
    (totals, request) => {
      if (request.status !== "approved" || !request.start_date) {
        return totals;
      }

      const requestYear = new Date(request.start_date).getFullYear();
      if (requestYear !== year) {
        return totals;
      }

      if (userMatch) {
        const matchesUser =
          (!!userMatch.authUserId && request.user_id === userMatch.authUserId) ||
          (!!userMatch.systemUserId && request.system_user_id === userMatch.systemUserId);

        if (!matchesUser) {
          return totals;
        }
      }

      const totalDays = toNumber(request.total_days);

      if (request.absence_type === "annual_leave") {
        totals.annual += totalDays;
      } else if (request.absence_type === "sick_leave") {
        totals.sick += totalDays;
      } else if (request.absence_type && PERSONAL_ABSENCE_TYPES.has(request.absence_type)) {
        totals.personal += totalDays;
      }

      return totals;
    },
    { annual: 0, sick: 0, personal: 0 }
  );
}
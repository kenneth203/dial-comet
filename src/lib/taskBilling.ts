type CustomerRateSource = {
  vaHourlyOverageRate?: number | null;
} | null | undefined;

type BillableTaskSource = {
  customerId?: string | null;
  isInternal?: boolean | null;
};

type TimedTaskSource = {
  totalTime?: number | null;
  billableTime?: number | null;
  isTimerRunning?: boolean | null;
};

export function getCustomerTaskHourlyRate(customer?: CustomerRateSource) {
  const rate = Number(customer?.vaHourlyOverageRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export function isTaskBillable(task?: BillableTaskSource | null) {
  return Boolean(task?.customerId) && !task?.isInternal;
}

export function getTaskBillableSeconds(task: TimedTaskSource, liveElapsedSeconds = 0) {
  const savedBillableSeconds = Number(task.billableTime ?? task.totalTime ?? 0);
  const normalizedSavedSeconds = Number.isFinite(savedBillableSeconds) ? Math.max(0, savedBillableSeconds) : 0;
  const normalizedLiveSeconds = Number.isFinite(liveElapsedSeconds) ? Math.max(0, liveElapsedSeconds) : 0;

  return task.isTimerRunning
    ? normalizedSavedSeconds + normalizedLiveSeconds
    : normalizedSavedSeconds;
}

export function calculateTaskCost(billableSeconds = 0, hourlyRate = 0) {
  const normalizedSeconds = Number.isFinite(billableSeconds) ? Math.max(0, billableSeconds) : 0;
  const normalizedRate = Number.isFinite(hourlyRate) ? Math.max(0, hourlyRate) : 0;

  return Math.round(((normalizedSeconds / 3600) * normalizedRate) * 100) / 100;
}
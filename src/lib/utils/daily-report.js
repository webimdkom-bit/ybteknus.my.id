export const DAILY_REPORT_STATUS = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  REVIEWED: "reviewed",
  REVISION: "revision",
});

export function dailyReportKey(userId, reportDate) {
  return `${userId}_${reportDate}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function isDailyReportReady(status) {
  return status === DAILY_REPORT_STATUS.SUBMITTED || status === DAILY_REPORT_STATUS.REVIEWED;
}

export function isDailyReportEditable(status) {
  return status !== DAILY_REPORT_STATUS.REVIEWED;
}

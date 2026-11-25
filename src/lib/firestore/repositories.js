import {
  addDoc,
  arrayUnion,
  writeBatch,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";
import { getDateKey } from "../utils/time.js";
import { BUSINESS_STATUS, normalizeBusinessChanges, normalizeBusinessFields } from "../utils/business.js";
import { dailyReportKey } from "../utils/daily-report.js";
import { getDeadlineDate } from "../../features/tasks/task-status.js";

const MAX_LIST = 200;

export const COLLECTIONS = Object.freeze({
  USERS: "users",
  ORGANIZATIONS: "organizations",
  BUSINESSES: "businesses",
  MEMBERSHIPS: "memberships",
  REGISTRATIONS: "registrations",
  SHIFTS: "shifts",
  SCHEDULES: "schedules",
  REQUESTS: "requests",
  TASKS: "tasks",
  TASK_REPORTS: "taskReports",
  DAILY_REPORTS: "dailyReports",
  ATTENDANCE: "attendance",
  AUDIT_LOGS: "auditLogs",
  NOTIFICATIONS: "notifications",
  ATTENDANCE_CORRECTIONS: "attendanceCorrections",
  OVERTIME: "overtime",
  FILES: "files",
  TASK_CATEGORIES: "taskCategories",
});

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listOwners(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.USERS),
    where("organizationId", "==", organizationId),
    where("role", "==", "owner"),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listAdmins(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.USERS),
    where("organizationId", "==", organizationId),
    where("role", "==", "admin"),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listEmployees(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.USERS),
    where("organizationId", "==", organizationId),
    where("role", "==", "employee"),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listEmployeesForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.USERS),
    where("organizationId", "==", organizationId),
    where("role", "==", "employee"),
    where("status", "==", "active"),
    where("businessIds", "array-contains", businessId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createUserProfile(uid, profile) {
  const reference = doc(db, COLLECTIONS.USERS, uid);
  await setDoc(reference, {
    ...profile,
    uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: uid, uid, ...profile };
}

export async function updateUserProfile(uid, changes) {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, COLLECTIONS.USERS, uid));
}

export async function listMembershipsForUser(userId, organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.MEMBERSHIPS),
    where("userId", "==", userId),
    where("organizationId", "==", organizationId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function saveAdminAccess({ userId, organizationId, access }) {
  const existing = await listMembershipsForUser(userId, organizationId);
  const selectedIds = new Set(access.map((item) => item.businessId));
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();
  existing.forEach((membership) => {
    if (!selectedIds.has(membership.businessId)) batch.delete(doc(db, COLLECTIONS.MEMBERSHIPS, membership.id));
  });
  access.forEach(({ businessId, permissions }) => {
    batch.set(doc(db, COLLECTIONS.MEMBERSHIPS, membershipKey(userId, businessId)), {
      userId,
      organizationId,
      businessId,
      role: "admin",
      permissions,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
  });
  batch.update(doc(db, COLLECTIONS.USERS, userId), {
    businessIds: access.map((item) => item.businessId),
    permissions: [...new Set(access.flatMap((item) => item.permissions || []))],
    updatedAt: timestamp,
  });
  await batch.commit();
}

export async function transferEmployee({ userId, organizationId, businessId }) {
  const existing = await listMembershipsForUser(userId, organizationId);
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();
  existing.filter((membership) => membership.role === "employee").forEach((membership) => batch.delete(doc(db, COLLECTIONS.MEMBERSHIPS, membership.id)));
  batch.set(doc(db, COLLECTIONS.MEMBERSHIPS, membershipKey(userId, businessId)), {
    userId,
    organizationId,
    businessId,
    role: "employee",
    permissions: [],
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  batch.update(doc(db, COLLECTIONS.USERS, userId), {
    businessIds: [businessId],
    updatedAt: timestamp,
  });
  await batch.commit();
}

function membershipKey(userId, businessId) {
  return `${userId}_${businessId}`;
}

export async function getOrganization(organizationId) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.ORGANIZATIONS, organizationId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listOrganizationsForOwner(ownerId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.ORGANIZATIONS),
    where("ownerId", "==", ownerId),
    limit(MAX_LIST),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createOrganization(organizationId, organization) {
  await setDoc(doc(db, COLLECTIONS.ORGANIZATIONS, organizationId), {
    ...organization,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: organizationId, ...organization };
}

export async function createBusiness(business) {
  const reference = await addDoc(collection(db, COLLECTIONS.BUSINESSES), {
    ...normalizeBusinessFields(business),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...normalizeBusinessFields(business) };
}

export async function getBusiness(businessId) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.BUSINESSES, businessId));
  return snapshot.exists() ? { id: snapshot.id, ...normalizeBusinessFields(snapshot.data()) } : null;
}

export async function updateBusiness(businessId, changes) {
  await updateDoc(doc(db, COLLECTIONS.BUSINESSES, businessId), {
    ...normalizeBusinessChanges(changes),
    updatedAt: serverTimestamp(),
  });
}

export async function listBusinessesForOrganization(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.BUSINESSES),
    where("organizationId", "==", organizationId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...normalizeBusinessFields(item.data()) }));
}

function openBusinessesQuery() {
  return query(
    collection(db, COLLECTIONS.BUSINESSES),
    where("status", "==", BUSINESS_STATUS.ACTIVE),
    where("acceptingRegistrations", "==", true),
    limit(50),
  );
}

export async function listOpenBusinesses() {
  const result = await getDocs(openBusinessesQuery());
  return result.docs.map((item) => ({ id: item.id, ...normalizeBusinessFields(item.data()) }));
}

export function watchOpenBusinesses(onNext, onError) {
  return onSnapshot(
    openBusinessesQuery(),
    (snapshot) => onNext(snapshot.docs.map((item) => ({ id: item.id, ...normalizeBusinessFields(item.data()) }))),
    (error) => onError?.(error),
  );
}

export async function createRegistration(registration) {
  const reference = await addDoc(collection(db, COLLECTIONS.REGISTRATIONS), {
    ...registration,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...registration, status: "pending" };
}

export async function listRegistrations(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.REGISTRATIONS),
    where("organizationId", "==", organizationId),
    where("status", "==", "pending"),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listRegistrationsForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.REGISTRATIONS),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
    where("status", "==", "pending"),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function approveEmployeeRegistration(registration) {
  const batch = writeBatch(db);
  const registrationRef = doc(db, COLLECTIONS.REGISTRATIONS, registration.id);
  const userRef = doc(db, COLLECTIONS.USERS, registration.userId);
  const membershipRef = doc(collection(db, COLLECTIONS.MEMBERSHIPS));
  const timestamp = serverTimestamp();

  batch.update(registrationRef, { status: "approved", reviewedAt: timestamp, updatedAt: timestamp });
  batch.update(userRef, {
    status: "active",
    businessIds: arrayUnion(registration.businessId),
    updatedAt: timestamp,
  });
  batch.set(membershipRef, {
    userId: registration.userId,
    organizationId: registration.organizationId,
    businessId: registration.businessId,
    role: "employee",
    permissions: [],
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await batch.commit();
}

export async function rejectEmployeeRegistration(registration) {
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();
  batch.update(doc(db, COLLECTIONS.REGISTRATIONS, registration.id), {
    status: "rejected",
    reviewedAt: timestamp,
    updatedAt: timestamp,
  });
  batch.update(doc(db, COLLECTIONS.USERS, registration.userId), {
    status: "suspended",
    updatedAt: timestamp,
  });
  await batch.commit();
}

export async function createShift(shift) {
  const reference = await addDoc(collection(db, COLLECTIONS.SHIFTS), {
    ...shift,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...shift, status: "active" };
}

export async function listShifts(organizationId, businessId = null) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (businessId) constraints.push(where("businessId", "==", businessId));
  const result = await getDocs(query(collection(db, COLLECTIONS.SHIFTS), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getShift(shiftId) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.SHIFTS, shiftId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function createSchedule(schedule) {
  const reference = await addDoc(collection(db, COLLECTIONS.SCHEDULES), {
    ...schedule,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...schedule, status: "active" };
}

function scheduleKey(organizationId, businessId, userId, date) {
  return [organizationId, businessId, userId, date].map((value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "_")).join("_");
}

export async function createSchedulesBatch(items) {
  if (!items.length) return { created: [], skipped: [] };
  return runTransaction(db, async (transaction) => {
    const created = [];
    const skipped = [];
    for (const item of items) {
      const reference = doc(db, COLLECTIONS.SCHEDULES, scheduleKey(item.organizationId, item.businessId, item.userId, item.date));
      const existing = await transaction.get(reference);
      if (existing.exists()) {
        skipped.push(item.userId);
        continue;
      }
      const record = {
        ...item,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      transaction.set(reference, record);
      created.push({ id: reference.id, ...record });
    }
    return { created, skipped };
  });
}

export async function listSchedules({ organizationId, businessId, userId, from, to }) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (businessId) constraints.push(where("businessId", "==", businessId));
  if (userId) constraints.push(where("userId", "==", userId));
  if (from) constraints.push(where("date", ">=", from));
  if (to) constraints.push(where("date", "<=", to));
  const result = await getDocs(query(collection(db, COLLECTIONS.SCHEDULES), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listEmployeeSchedules(userId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.SCHEDULES),
    where("userId", "==", userId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createAttendance(attendance) {
  const reference = await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
    ...attendance,
    createdAt: serverTimestamp(),
  });
  return { id: reference.id, ...attendance };
}

export async function listAttendance(userId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("userId", "==", userId),
    limit(MAX_LIST),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function updateAttendance(attendanceId, changes) {
  await updateDoc(doc(db, COLLECTIONS.ATTENDANCE, attendanceId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function createAttendanceCorrection(correction) {
  const reference = await addDoc(collection(db, COLLECTIONS.ATTENDANCE_CORRECTIONS), {
    ...correction,
    createdAt: serverTimestamp(),
  });
  return { id: reference.id, ...correction };
}

export async function listAttendanceCorrectionsForUser(userId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.ATTENDANCE_CORRECTIONS),
    where("userId", "==", userId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createOvertime(record) {
  const reference = await addDoc(collection(db, COLLECTIONS.OVERTIME), {
    ...record,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...record, status: "pending" };
}

export async function listOvertimeForUser(userId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.OVERTIME), where("userId", "==", userId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listOvertimeForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.OVERTIME),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function updateOvertime(overtimeId, changes) {
  await updateDoc(doc(db, COLLECTIONS.OVERTIME, overtimeId), { ...changes, updatedAt: serverTimestamp() });
}

export async function listAttendanceForOrganization(organizationId, { businessId, date, from, to } = {}) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (businessId) constraints.push(where("businessId", "==", businessId));
  if (date) constraints.push(where("attendanceDate", "==", date));
  if (from) constraints.push(where("attendanceDate", ">=", from));
  if (to) constraints.push(where("attendanceDate", "<=", to));
  const result = await getDocs(query(collection(db, COLLECTIONS.ATTENDANCE), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listAuditLogs(organizationId, { businessId, max = 100 } = {}) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (businessId) constraints.push(where("businessId", "==", businessId));
  constraints.push(limit(max));
  const result = await getDocs(query(collection(db, COLLECTIONS.AUDIT_LOGS), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createFileMetadata(record) {
  const reference = await addDoc(collection(db, COLLECTIONS.FILES), {
    ...record,
    createdAt: serverTimestamp(),
  });
  return { id: reference.id, ...record };
}

export async function listFilesForOrganization(organizationId, max = 200) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.FILES),
    where("organizationId", "==", organizationId),
    limit(max),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listFilesForBusiness(organizationId, businessId, max = 100) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (businessId) constraints.push(where("businessId", "==", businessId));
  constraints.push(limit(max));
  const result = await getDocs(query(collection(db, COLLECTIONS.FILES), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listFilesForUser(userId, max = 100) {
  const result = await getDocs(query(collection(db, COLLECTIONS.FILES), where("uploadedBy", "==", userId), limit(max)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function deleteFileMetadata(fileId) {
  await deleteDoc(doc(db, COLLECTIONS.FILES, fileId));
}

export async function listTaskCategories(organizationId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASK_CATEGORIES), where("organizationId", "==", organizationId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createTaskCategory(record) {
  const reference = await addDoc(collection(db, COLLECTIONS.TASK_CATEGORIES), { ...record, createdAt: serverTimestamp() });
  return { id: reference.id, ...record };
}

export async function listNotifications(userId, max = 50) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.NOTIFICATIONS),
    where("userId", "==", userId),
    limit(max),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function watchNotifications(userId, callback, onError) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.NOTIFICATIONS), where("userId", "==", userId)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.warn("[notifications] listener:", error?.code || error?.message || error);
      onError?.(error);
    },
  );
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notificationId), { read: true, readAt: serverTimestamp() });
}

export async function markAllNotificationsRead(notifications) {
  const batch = writeBatch(db);
  notifications.filter((item) => !item.read).forEach((item) => batch.update(doc(db, COLLECTIONS.NOTIFICATIONS, item.id), { read: true, readAt: serverTimestamp() }));
  await batch.commit();
}

export async function createOperationalRequest(request) {
  const reference = await addDoc(collection(db, COLLECTIONS.REQUESTS), {
    ...request,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...request, status: "pending" };
}

export async function listOperationalRequestsForUser(userId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.REQUESTS), where("userId", "==", userId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listOperationalRequestsForOrganization(organizationId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.REQUESTS), where("organizationId", "==", organizationId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listOperationalRequestsForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.REQUESTS),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function reviewOperationalRequest(requestId, changes) {
  await updateDoc(doc(db, COLLECTIONS.REQUESTS, requestId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function createTask(task) {
  const reference = await addDoc(collection(db, COLLECTIONS.TASKS), {
    ...task,
    status: "assigned",
    progress: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...task, status: "assigned", progress: 0 };
}

export async function listTasksForOrganization(organizationId, max = MAX_LIST) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.TASKS),
    where("organizationId", "==", organizationId),
    orderBy("createdAt", "desc"),
    limit(max),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTasksForBusiness(organizationId, businessId, max = MAX_LIST) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.TASKS),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc"),
    limit(max),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTasksForUser(userId, max = MAX_LIST) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.TASKS),
    where("assignedTo", "array-contains", userId),
    orderBy("createdAt", "desc"),
    limit(max),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function watchTasksForOrganization(organizationId, callback, onError, max = MAX_LIST) {
  return onSnapshot(
    query(collection(db, COLLECTIONS.TASKS), where("organizationId", "==", organizationId), orderBy("createdAt", "desc"), limit(max)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.warn("[tasks] listener:", error?.code || error?.message || error);
      onError?.(error);
    },
  );
}

export function watchTasksForBusiness(organizationId, businessId, callback, onError, max = MAX_LIST) {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.TASKS),
      where("organizationId", "==", organizationId),
      where("businessId", "==", businessId),
      orderBy("createdAt", "desc"),
      limit(max),
    ),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.warn("[tasks] listener:", error?.code || error?.message || error);
      onError?.(error);
    },
  );
}

export function watchTasksForUser(userId, callback, onError) {
  return onSnapshot(
    query(
      collection(db, COLLECTIONS.TASKS),
      where("assignedTo", "array-contains", userId),
      orderBy("createdAt", "desc"),
      limit(MAX_LIST),
    ),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => {
      console.warn("[tasks] listener:", error?.code || error?.message || error);
      onError?.(error);
    },
  );
}

export async function updateTask(taskId, changes) {
  await updateDoc(doc(db, COLLECTIONS.TASKS, taskId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export function archiveTask(taskId, actorId) {
  return updateTaskAndDailyReports(taskId, { archived: true, archivedAt: serverTimestamp(), archivedBy: actorId });
}

export function restoreTask(taskId) {
  return updateTaskAndDailyReports(taskId, { archived: false, archivedAt: null, archivedBy: null });
}

export async function createTaskReport(report) {
  const reference = await addDoc(collection(db, COLLECTIONS.TASK_REPORTS), {
    ...report,
    status: "submitted",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...report, status: "submitted" };
}

export async function getDailyReport(userId, reportDate) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.DAILY_REPORTS, dailyReportKey(userId, reportDate)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveDailyReport({ profile, reportDate, report }) {
  const reference = doc(db, COLLECTIONS.DAILY_REPORTS, dailyReportKey(profile.uid, reportDate));
  const existing = await getDoc(reference);
  const editable = { ...(report || {}) };
  delete editable.id;
  delete editable.taskIds;
  const identity = existing.exists() ? {} : {
    userId: profile.uid,
    organizationId: profile.organizationId,
    businessIds: profile.businessIds || [],
    role: profile.role,
    displayName: profile.displayName || "",
    email: profile.email || "",
    reportDate,
  };
  await setDoc(reference, { ...editable, ...identity, updatedAt: serverTimestamp() }, { merge: true });
  return { id: reference.id, ...editable, ...identity, userId: profile.uid, organizationId: profile.organizationId, reportDate };
}

export async function reviewDailyReport(reportId, changes) {
  await updateDoc(doc(db, COLLECTIONS.DAILY_REPORTS, reportId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function listDailyReportsForUser(userId, from, to) {
  const constraints = [where("userId", "==", userId)];
  if (from) constraints.push(where("reportDate", ">=", from));
  if (to) constraints.push(where("reportDate", "<=", to));
  const result = await getDocs(query(collection(db, COLLECTIONS.DAILY_REPORTS), ...constraints, orderBy("reportDate", "desc")));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listDailyReportsForOrganization(organizationId, reportDate, businessId = null) {
  const constraints = [where("organizationId", "==", organizationId)];
  if (reportDate) constraints.push(where("reportDate", "==", reportDate));
  if (businessId) constraints.push(where("businessIds", "array-contains", businessId));
  const result = await getDocs(query(collection(db, COLLECTIONS.DAILY_REPORTS), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function syncDailyReportTask({ taskId, task = {}, userId = null, reportId = null, reportStatus = null }) {
  const users = [...new Set([...(task.assignedTo || []), userId].filter(Boolean))];
  if (!users.length) return;
  const dates = new Set([getDateKey()]);
  if (task.deadline) dates.add(getDeadlineDate(task.deadline));
  const references = [];
  users.forEach((uid) => dates.forEach((date) => references.push(doc(db, COLLECTIONS.DAILY_REPORTS, dailyReportKey(uid, date)))));
  const snapshots = await Promise.all(references.map((reference) => getDoc(reference)));
  const batch = writeBatch(db);
  let changed = false;
  snapshots.forEach((snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    const entries = Array.isArray(data.tasks) ? [...data.tasks] : [];
    const index = entries.findIndex((entry) => entry.taskId === taskId);
    if (index < 0 && !(data.taskIds || []).includes(taskId) && data.reportDate !== getDeadlineDate(task.deadline)) return;
    const patch = {
      taskStatus: task.status || "assigned",
      completed: task.status === "approved",
      progress: Number(task.progress || 0),
      archived: Boolean(task.archived),
      reportId: reportId || entries[index]?.reportId || null,
      reportStatus: reportStatus || entries[index]?.reportStatus || null,
      updatedAt: serverTimestamp(),
    };
    if (index >= 0) entries[index] = { ...entries[index], ...patch };
    else entries.push({ taskId, title: task.title || "-", businessId: task.businessId || "", deadline: task.deadline || "", ...patch });
    batch.update(snapshot.ref, { tasks: entries, updatedAt: serverTimestamp() });
    changed = true;
  });
  if (changed) await batch.commit();
}

export async function updateTaskAndDailyReports(taskId, changes, options = {}) {
  await updateTask(taskId, changes);
  const snapshot = await getDoc(doc(db, COLLECTIONS.TASKS, taskId));
  if (snapshot.exists()) {
    await syncDailyReportTask({ taskId, task: snapshot.data(), userId: options.userId || null, reportId: options.reportId || null, reportStatus: options.reportStatus || null });
  }
}

export async function listFilesForTarget(organizationId, targetType, targetId, uploadedBy = "") {
  const constraints = [
    where("organizationId", "==", organizationId),
    where("targetType", "==", targetType),
    where("targetId", "==", targetId),
  ];
  if (uploadedBy) constraints.push(where("uploadedBy", "==", uploadedBy));
  const result = await getDocs(query(collection(db, COLLECTIONS.FILES), ...constraints));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTaskReportsForUser(userId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASK_REPORTS), where("userId", "==", userId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTaskReportsForOrganization(organizationId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASK_REPORTS), where("organizationId", "==", organizationId), limit(MAX_LIST)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTaskReportsForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.TASK_REPORTS),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function reviewTaskReport(reportId, changes) {
  await updateDoc(doc(db, COLLECTIONS.TASK_REPORTS, reportId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebase.js";

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
    ...business,
    status: business.status || "active",
    acceptingRegistrations: business.acceptingRegistrations ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: reference.id, ...business };
}

export async function getBusiness(businessId) {
  const snapshot = await getDoc(doc(db, COLLECTIONS.BUSINESSES, businessId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function updateBusiness(businessId, changes) {
  await updateDoc(doc(db, COLLECTIONS.BUSINESSES, businessId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function listBusinessesForOrganization(organizationId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.BUSINESSES),
    where("organizationId", "==", organizationId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listOpenBusinesses() {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.BUSINESSES),
    where("status", "==", "active"),
    where("acceptingRegistrations", "==", true),
    limit(50),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
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
  const reference = await addDoc(collection(db, "attendance"), {
    ...attendance,
    createdAt: serverTimestamp(),
  });
  return { id: reference.id, ...attendance };
}

export async function listAttendance(userId) {
  const result = await getDocs(query(
    collection(db, "attendance"),
    where("userId", "==", userId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
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

export async function listTasksForOrganization(organizationId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASKS), where("organizationId", "==", organizationId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTasksForBusiness(organizationId, businessId) {
  const result = await getDocs(query(
    collection(db, COLLECTIONS.TASKS),
    where("organizationId", "==", organizationId),
    where("businessId", "==", businessId),
  ));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTasksForUser(userId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASKS), where("assignedTo", "array-contains", userId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function updateTask(taskId, changes) {
  await updateDoc(doc(db, COLLECTIONS.TASKS, taskId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
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

export async function listTaskReportsForUser(userId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASK_REPORTS), where("userId", "==", userId)));
  return result.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listTaskReportsForOrganization(organizationId) {
  const result = await getDocs(query(collection(db, COLLECTIONS.TASK_REPORTS), where("organizationId", "==", organizationId)));
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

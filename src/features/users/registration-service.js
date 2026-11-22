import {
  approveEmployeeRegistration,
  listRegistrations,
  rejectEmployeeRegistration,
} from "../../lib/firestore/repositories.js";

export { approveEmployeeRegistration, rejectEmployeeRegistration };

export function listPendingRegistrations(organizationId) {
  return listRegistrations(organizationId);
}

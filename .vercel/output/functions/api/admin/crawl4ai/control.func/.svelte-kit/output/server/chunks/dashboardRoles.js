import { i as isOwnerEmail } from "./mailer.js";
function normalizeDashboardRole(email, record) {
  if (isOwnerEmail(email)) return "owner";
  const r = record?.role;
  if (r === "owner") return "owner";
  if (r === "admin" || r === "moderator" || r === "supervisor") return "supervisor";
  return "supervisor";
}
function isAdminPanelRole(role) {
  return role === "owner" || role === "supervisor";
}
export {
  isAdminPanelRole as i,
  normalizeDashboardRole as n
};

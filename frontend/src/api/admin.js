import { get, post, del } from "./client";

export const getAdminStats = () => get("/admin/stats");
export const getAdminUsers = (search = "") =>
  get(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const getSiteActivity = (range = "7d") => get(`/admin/activity?range=${range}`);
export const getUserSignups = (range = "7d") => get(`/admin/signups?range=${range}`);
export const getUserActivity = (userId, range = "7d") =>
  get(`/admin/users/${userId}/activity?range=${range}`);
export const resetUserUsage = (userId) => post(`/admin/users/${userId}/reset-usage`, {});
export const deleteUser = (userId) => del(`/admin/users/${userId}`);

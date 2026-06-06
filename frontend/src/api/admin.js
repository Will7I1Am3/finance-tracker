import { get, post, del } from "./client";

const tzParam = (tz) => `tz=${encodeURIComponent(tz)}`;

export const getAdminStats = (tz = "UTC") =>
  get(`/admin/stats?${tzParam(tz)}`);

export const getAdminUsers = (search = "", tz = "UTC") =>
  get(`/admin/users?${search ? `search=${encodeURIComponent(search)}&` : ""}${tzParam(tz)}`);

export const getSiteActivity = (range = "7d", tz = "UTC") =>
  get(`/admin/activity?range=${range}&${tzParam(tz)}`);

export const getUserSignups = (range = "7d", tz = "UTC") =>
  get(`/admin/signups?range=${range}&${tzParam(tz)}`);

export const getUserActivity = (userId, range = "7d", tz = "UTC") =>
  get(`/admin/users/${userId}/activity?range=${range}&${tzParam(tz)}`);

export const resetUserUsage = (userId) => post(`/admin/users/${userId}/reset-usage`, {});
export const deleteUser = (userId) => del(`/admin/users/${userId}`);

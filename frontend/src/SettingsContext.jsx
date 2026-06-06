import { createContext, useContext, useState } from "react";

export const TIMEZONES = [
  { value: "auto",                   label: "Auto (browser)" },
  // United States
  { value: "America/New_York",       label: "New York" },
  { value: "America/Chicago",        label: "Chicago" },
  { value: "America/Denver",         label: "Denver" },
  { value: "America/Phoenix",        label: "Phoenix (no DST)" },
  { value: "America/Los_Angeles",    label: "Los Angeles" },
  { value: "America/Anchorage",      label: "Anchorage" },
  { value: "Pacific/Honolulu",       label: "Honolulu" },
  // Europe
  { value: "Europe/London",          label: "London" },
  { value: "Europe/Paris",           label: "Paris" },
  { value: "Europe/Berlin",          label: "Berlin" },
  // Middle East & Asia
  { value: "Asia/Dubai",             label: "Dubai" },
  { value: "Asia/Kolkata",           label: "Mumbai" },
  { value: "Asia/Singapore",         label: "Singapore" },
  { value: "Asia/Tokyo",             label: "Tokyo" },
  // Oceania
  { value: "Australia/Sydney",       label: "Sydney" },
];

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [timezone, setTimezoneState] = useState(
    () => localStorage.getItem("timezone") || "auto"
  );

  const setTimezone = (tz) => {
    localStorage.setItem("timezone", tz);
    setTimezoneState(tz);
  };

  const resolvedTimezone =
    timezone === "auto"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : timezone;

  return (
    <SettingsContext.Provider value={{ timezone, setTimezone, resolvedTimezone, TIMEZONES }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

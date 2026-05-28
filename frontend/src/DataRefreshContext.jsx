import { createContext, useContext, useState } from "react";

const DataRefreshContext = createContext({ refreshKey: 0, triggerRefresh: () => {} });

export function DataRefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <DataRefreshContext.Provider value={{ refreshKey, triggerRefresh: () => setRefreshKey(k => k + 1) }}>
      {children}
    </DataRefreshContext.Provider>
  );
}

export function useDataRefresh() {
  return useContext(DataRefreshContext);
}

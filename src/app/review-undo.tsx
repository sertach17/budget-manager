"use client";

import { createContext, useContext } from "react";

// Moving a reviewed transaction back to "Pending to review". `onUnreview`
// replaces saving to the database; the demo wraps its pages in
// UnreviewProvider to keep the change in the page only.

type Unreview = { onUnreview?: (transactionIds: string[]) => void };

const UnreviewContext = createContext<Unreview>({});

export function UnreviewProvider({
  onUnreview,
  children,
}: {
  onUnreview: (transactionIds: string[]) => void;
  children: React.ReactNode;
}) {
  return <UnreviewContext.Provider value={{ onUnreview }}>{children}</UnreviewContext.Provider>;
}

export function useUnreview() {
  return useContext(UnreviewContext);
}

"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/types";

type UserContextType = {
  user: Profile | null;
};

const UserContext = createContext<UserContextType>({ user: null });

export function UserProvider({
  user,
  children,
}: {
  user: Profile | null;
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

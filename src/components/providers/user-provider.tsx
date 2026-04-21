"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/types";

type UserContextType = {
  user: Profile | null;
  permissions: string[];
};

const UserContext = createContext<UserContextType>({ user: null, permissions: [] });

export function UserProvider({
  user,
  permissions = [],
  children,
}: {
  user: Profile | null;
  permissions?: string[];
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={{ user, permissions }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

import type { UserRole, UserLocale } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    locale: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      locale: string;
    };
  }
}


export type { UserRole, UserLocale };

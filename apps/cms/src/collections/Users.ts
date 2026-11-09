import type { CollectionConfig } from "payload";
import { hasRole, isAdmin, isAdminField, ROLES } from "../access/roles";

export const Users: CollectionConfig = {
  slug: "users",
  auth: { maxLoginAttempts: 5, lockTime: 15 * 60 * 1000, useAPIKey: false },
  admin: { useAsTitle: "email", group: "Settings" },
  access: {
    // Staff see each other's names; only admins manage accounts.
    read: ({ req }) => !!req.user,
    create: isAdmin,
    update: ({ req, id }) => hasRole(req.user, "admin") || req.user?.id === id,
    delete: isAdmin,
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "roles",
      type: "select",
      hasMany: true,
      required: true,
      defaultValue: ["author"],
      options: ROLES.map((r) => ({ label: r[0]!.toUpperCase() + r.slice(1), value: r })),
      // Only admins change roles, so nobody raises their own.
      access: { create: isAdminField, update: isAdminField },
      saveToJWT: true,
    },
  ],
};

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * An API key skips the sign-in proxy and its second factor (#30), so only
 * machine accounts (only the newsbot or viewer role) keep one; the key of
 * any other account is removed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "users" SET "enable_a_p_i_key" = false, "api_key" = NULL, "api_key_index" = NULL
  WHERE ("enable_a_p_i_key" OR "api_key" IS NOT NULL)
    AND (
      NOT EXISTS (SELECT 1 FROM "users_roles" r WHERE r."parent_id" = "users"."id")
      OR EXISTS (
        SELECT 1 FROM "users_roles" r
        WHERE r."parent_id" = "users"."id" AND r."value" NOT IN ('newsbot', 'viewer')
      )
    );`)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // A removed key is not restored.
}

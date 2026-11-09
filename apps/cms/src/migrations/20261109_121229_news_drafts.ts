import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_corrections_kind" AS ENUM('update', 'correction');
  CREATE TYPE "public"."enum__articles_v_version_corrections_kind" AS ENUM('update', 'correction');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'newsbot';
  CREATE TABLE "articles_corrections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"kind" "enum_articles_corrections_kind" DEFAULT 'update'
  );
  
  CREATE TABLE "articles_corrections_locales" (
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "_articles_v_version_corrections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"kind" "enum__articles_v_version_corrections_kind" DEFAULT 'update',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v_version_corrections_locales" (
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "articles_sources" ADD COLUMN "title" varchar;
  ALTER TABLE "articles" ADD COLUMN "external_id" varchar;
  ALTER TABLE "articles" ADD COLUMN "generated_by" varchar;
  ALTER TABLE "articles" ADD COLUMN "auto_published" boolean DEFAULT false;
  ALTER TABLE "_articles_v_version_sources" ADD COLUMN "title" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_external_id" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_generated_by" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_auto_published" boolean DEFAULT false;
  ALTER TABLE "articles_corrections" ADD CONSTRAINT "articles_corrections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_corrections_locales" ADD CONSTRAINT "articles_corrections_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles_corrections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_corrections" ADD CONSTRAINT "_articles_v_version_corrections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_corrections_locales" ADD CONSTRAINT "_articles_v_version_corrections_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v_version_corrections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_corrections_order_idx" ON "articles_corrections" USING btree ("_order");
  CREATE INDEX "articles_corrections_parent_id_idx" ON "articles_corrections" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "articles_corrections_locales_locale_parent_id_unique" ON "articles_corrections_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_corrections_locales_parent_id_idx" ON "articles_corrections_locales" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_corrections_order_idx" ON "_articles_v_version_corrections" USING btree ("_order");
  CREATE INDEX "_articles_v_version_corrections_parent_id_idx" ON "_articles_v_version_corrections" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_articles_v_version_corrections_locales_locale_parent_id_uni" ON "_articles_v_version_corrections_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_version_corrections_locales_parent_id_idx" ON "_articles_v_version_corrections_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "articles_external_id_idx" ON "articles" USING btree ("external_id");
  CREATE INDEX "_articles_v_version_version_external_id_idx" ON "_articles_v" USING btree ("version_external_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles_corrections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles_corrections_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_corrections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_corrections_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "articles_corrections" CASCADE;
  DROP TABLE "articles_corrections_locales" CASCADE;
  DROP TABLE "_articles_v_version_corrections" CASCADE;
  DROP TABLE "_articles_v_version_corrections_locales" CASCADE;
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'reviewer', 'author', 'viewer');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  DROP INDEX "articles_external_id_idx";
  DROP INDEX "_articles_v_version_version_external_id_idx";
  ALTER TABLE "articles_sources" DROP COLUMN "title";
  ALTER TABLE "articles" DROP COLUMN "external_id";
  ALTER TABLE "articles" DROP COLUMN "generated_by";
  ALTER TABLE "articles" DROP COLUMN "auto_published";
  ALTER TABLE "_articles_v_version_sources" DROP COLUMN "title";
  ALTER TABLE "_articles_v" DROP COLUMN "version_external_id";
  ALTER TABLE "_articles_v" DROP COLUMN "version_generated_by";
  ALTER TABLE "_articles_v" DROP COLUMN "version_auto_published";
  DROP TYPE "public"."enum_articles_corrections_kind";
  DROP TYPE "public"."enum__articles_v_version_corrections_kind";`)
}

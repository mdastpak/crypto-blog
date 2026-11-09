import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig } from "payload";
import sharp from "sharp";
import { Articles } from "./collections/Articles";
import { Authors } from "./collections/Authors";
import { Campaigns } from "./collections/Campaigns";
import { Media } from "./collections/Media";
import { Categories, Tags } from "./collections/Taxonomies";
import { Users } from "./collections/Users";
import { parseEnv } from "./env";
import { configureRevalidation } from "./hooks/revalidate";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const env = parseEnv(process.env);

configureRevalidation({ urls: env.WEB_REVALIDATE_URLS, secret: env.REVALIDATE_SECRET });

export default buildConfig({
  serverURL: env.CMS_PUBLIC_URL,
  secret: env.PAYLOAD_SECRET,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: " · Crypto Blog CMS" },
    importMap: { baseDir: dirname },
  },
  collections: [Articles, Campaigns, Categories, Tags, Authors, Media, Users],
  // Editorial content in every language of the blog; Persian first.
  localization: {
    locales: [
      { code: "fa", label: "فارسی", rtl: true },
      { code: "en", label: "English" },
    ],
    defaultLocale: "fa",
    fallback: true,
  },
  i18n: { fallbackLanguage: "en" },
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URL },
    // Schema changes go through migrations in every environment, run once
    // per release by `pnpm migrate` (src/migrate.ts) under a lock, so that
    // several nodes never race to change the schema at start-up.
    push: false,
    migrationDir: path.resolve(dirname, "migrations"),
  }),
  sharp,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  graphQL: { disable: true },
  cors: [],
  csrf: [env.CMS_PUBLIC_URL],
  plugins: env.S3_BUCKET
    ? [
        s3Storage({
          collections: { media: true },
          bucket: env.S3_BUCKET,
          config: {
            region: env.S3_REGION,
            endpoint: env.S3_ENDPOINT || undefined,
            forcePathStyle: !!env.S3_ENDPOINT,
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            },
          },
        }),
      ]
    : [],
  upload: { limits: { fileSize: 10 * 1024 * 1024 } },
  jobs: { tasks: [], autoRun: [{ cron: "* * * * *", queue: "default" }] },
});

import { drizzle } from "drizzle-orm/node-postgres";

import * as authSchema from "./tables/auth.drizzle.ts";
import * as domainSchema from "./tables/schema.gen.ts";

export const schema = {
	...authSchema,
	...domainSchema,
};

export const db = drizzle(process.env.DATABASE_URL ?? "", {
	schema,
	logger: process.env.NODE_ENV !== "production" && false,
});

export type Schema = typeof schema;

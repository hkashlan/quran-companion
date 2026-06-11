import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";

import { reviews } from "../tables/review.drizzle.ts";

export const selectReviewSchema = createSelectSchema(reviews);

export const createReviewInputSchema = createInsertSchema(reviews).omit({
	id: true,
	createdAt: true,
	completedAt: true,
	pointsEarned: true,
});

export const updateReviewInputSchema = createUpdateSchema(reviews).omit({
	id: true,
	createdAt: true,
});

export type Review = typeof reviews.$inferSelect;
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewInputSchema>;

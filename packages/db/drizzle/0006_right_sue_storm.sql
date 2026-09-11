CREATE TYPE "public"."plan_reset_strategy" AS ENUM('distribute', 'extend', 'skip');--> statement-breakpoint
CREATE TABLE "plan_reset_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_plan_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"strategy" "plan_reset_strategy" NOT NULL,
	"backlog_days" integer NOT NULL,
	"backlog_pages" integer NOT NULL,
	"waived_count" integer NOT NULL,
	"extra_pages_per_day" integer,
	"catchup_days" integer,
	"catchup_until" date,
	"skipped_from_page" integer,
	"skipped_to_page" integer,
	"skipped_pages" integer,
	"khatmah_before" date,
	"khatmah_after" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_plans" ADD COLUMN "catchup_extra_pages" integer;--> statement-breakpoint
ALTER TABLE "review_plans" ADD COLUMN "catchup_until" date;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reset_event_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_reset_events" ADD CONSTRAINT "plan_reset_events_review_plan_id_review_plans_id_fk" FOREIGN KEY ("review_plan_id") REFERENCES "public"."review_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reset_events" ADD CONSTRAINT "plan_reset_events_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reset_events" ADD CONSTRAINT "plan_reset_events_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_reset_events_studentId_idx" ON "plan_reset_events" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "plan_reset_events_teacherId_idx" ON "plan_reset_events" USING btree ("teacher_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reset_event_id_plan_reset_events_id_fk" FOREIGN KEY ("reset_event_id") REFERENCES "public"."plan_reset_events"("id") ON DELETE no action ON UPDATE no action;
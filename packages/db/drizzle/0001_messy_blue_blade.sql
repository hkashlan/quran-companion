CREATE TYPE "public"."plan_change_field" AS ENUM('daily_amount', 'start_page');--> statement-breakpoint
CREATE TABLE "plan_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_plan_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"field" "plan_change_field" NOT NULL,
	"proposed_daily_amount" integer,
	"proposed_start_page" integer,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "surah_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "surah_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "verse_from" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "verse_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_review_plan_id_review_plans_id_fk" FOREIGN KEY ("review_plan_id") REFERENCES "public"."review_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_change_requests_teacherId_idx" ON "plan_change_requests" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "plan_change_requests_studentId_idx" ON "plan_change_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "plan_change_requests_status_idx" ON "plan_change_requests" USING btree ("status");
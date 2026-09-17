CREATE TYPE "public"."message_template_kind" AS ENUM('late', 'done');--> statement-breakpoint
DROP INDEX "message_templates_teacherId_idx";--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "kind" "message_template_kind" DEFAULT 'late' NOT NULL;--> statement-breakpoint
-- Templates that predate the split were all saved on the late-students
-- screen, the only composer that existed then. The default exists purely to
-- backfill them; the column is always written explicitly from here on.
ALTER TABLE "message_templates" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "message_templates_teacherId_kind_idx" ON "message_templates" USING btree ("teacher_id","kind");
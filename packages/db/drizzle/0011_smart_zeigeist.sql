CREATE TYPE "public"."message_template_kind" AS ENUM('late', 'done');--> statement-breakpoint
DROP INDEX "message_templates_teacherId_idx";--> statement-breakpoint
ALTER TABLE "message_templates" ADD COLUMN "kind" "message_template_kind" NOT NULL;--> statement-breakpoint
CREATE INDEX "message_templates_teacherId_kind_idx" ON "message_templates" USING btree ("teacher_id","kind");
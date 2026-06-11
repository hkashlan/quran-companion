CREATE TYPE "public"."audit_action" AS ENUM('session_created', 'review_plan_created', 'review_plan_updated', 'review_plan_deleted', 'review_created');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."circle_member_role" AS ENUM('owner', 'teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."circle_join_role" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."push_token_kind" AS ENUM('webpush', 'fcm', 'apns');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"teacher_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_id" uuid NOT NULL,
	"student_id" text,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"streak_last_date" date,
	"language" varchar(5) DEFAULT 'ar' NOT NULL,
	"timezone" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "circle_member_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_circle_memberships_circle_user" UNIQUE("circle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"circle_id" uuid NOT NULL,
	"requested_role" "circle_join_role" NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_circle_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"reminder_hours_before_start" integer DEFAULT 2 NOT NULL,
	"code" varchar(8) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "learning_circles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" text,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"dedupe_key" varchar(255),
	"error" text,
	"sent_at" timestamp,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "push_token_kind" DEFAULT 'webpush' NOT NULL,
	"token" varchar(512),
	"endpoint" text,
	"p256dh" text,
	"auth" text,
	"platform" varchar(16) DEFAULT 'unknown' NOT NULL,
	"device_id" varchar(128),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"start_surah_number" integer NOT NULL,
	"start_verse" integer NOT NULL,
	"end_surah_number" integer NOT NULL,
	"end_verse" integer NOT NULL,
	"range_mode" varchar(10) DEFAULT 'verses' NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"daily_amount" integer NOT NULL,
	"daily_unit" varchar(10) DEFAULT 'verses' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"start_surah_number" integer NOT NULL,
	"start_surah_name" text NOT NULL,
	"start_verse" integer NOT NULL,
	"end_surah_number" integer NOT NULL,
	"end_surah_name" text NOT NULL,
	"end_verse" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"review_plan_id" uuid,
	"surah_number" integer NOT NULL,
	"surah_name" text NOT NULL,
	"verse_from" integer NOT NULL,
	"end_surah_number" integer,
	"end_surah_name" text,
	"verse_to" integer NOT NULL,
	"range_mode" varchar(10) DEFAULT 'verses' NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"assigned_date" date NOT NULL,
	"completed_at" timestamp,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"start_surah_number" integer,
	"memorized_surah" text NOT NULL,
	"memorized_verse_from" integer NOT NULL,
	"end_surah_number" integer,
	"end_surah_name" text,
	"memorized_verse_to" integer NOT NULL,
	"range_mode" varchar(10) DEFAULT 'verses' NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"session_date" date NOT NULL,
	"session_time" varchar(5),
	"notes" text,
	"evaluation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_circle_id_learning_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."learning_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_circle_id_learning_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."learning_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_memberships" ADD CONSTRAINT "circle_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_circle_id_learning_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."learning_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_circle_slots" ADD CONSTRAINT "learning_circle_slots_circle_id_learning_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."learning_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_circles" ADD CONSTRAINT "learning_circles_owner_teacher_id_user_id_fk" FOREIGN KEY ("owner_teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_plans" ADD CONSTRAINT "review_plans_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_plans" ADD CONSTRAINT "review_plans_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_submissions" ADD CONSTRAINT "review_submissions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_submissions" ADD CONSTRAINT "review_submissions_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_review_plan_id_review_plans_id_fk" FOREIGN KEY ("review_plan_id") REFERENCES "public"."review_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_records" ADD CONSTRAINT "session_records_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_records" ADD CONSTRAINT "session_records_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_invitations" ADD CONSTRAINT "teacher_invitations_circle_id_learning_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."learning_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_invitations" ADD CONSTRAINT "teacher_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_invitations" ADD CONSTRAINT "teacher_invitations_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_circleId_idx" ON "audit_logs" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "join_requests_circleId_idx" ON "join_requests" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "join_requests_status_idx" ON "join_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_deliveries_userId_idx" ON "notification_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_token_idx" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_endpoint_idx" ON "push_tokens" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "review_plans_studentId_idx" ON "review_plans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "review_plans_teacherId_idx" ON "review_plans" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "review_submissions_reviewId_idx" ON "review_submissions" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_studentId_idx" ON "reviews" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "reviews_teacherId_idx" ON "reviews" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "reviews_assignedDate_idx" ON "reviews" USING btree ("assigned_date");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_records_studentId_idx" ON "session_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "session_records_teacherId_idx" ON "session_records" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "teacher_invitations_circleId_idx" ON "teacher_invitations" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "teacher_invitations_inviteeId_idx" ON "teacher_invitations" USING btree ("invitee_id");
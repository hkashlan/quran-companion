CREATE TABLE "excuse_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_excuse_days_user_date" UNIQUE("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "learning_circles" ADD COLUMN "excuse_days_per_month" integer;--> statement-breakpoint
ALTER TABLE "excuse_days" ADD CONSTRAINT "excuse_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "excuse_days_userId_idx" ON "excuse_days" USING btree ("user_id");
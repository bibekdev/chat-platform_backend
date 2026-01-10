CREATE TYPE "public"."friend_request_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" "friend_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_friend_request" ON "friend_requests" USING btree ("sender_id","receiver_id");--> statement-breakpoint
CREATE INDEX "friend_requests_receiver_idx" ON "friend_requests" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "friend_requests_sender_idx" ON "friend_requests" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "friend_requests_status_idx" ON "friend_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_friendship" ON "friends" USING btree ("user_id","friend_id");--> statement-breakpoint
CREATE INDEX "friends_user_idx" ON "friends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "friends_friend_idx" ON "friends" USING btree ("friend_id");
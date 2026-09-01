CREATE TABLE "wifi_speed_profile" (
	"download_speed_mbps" integer,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"upload_speed_mbps" integer
);

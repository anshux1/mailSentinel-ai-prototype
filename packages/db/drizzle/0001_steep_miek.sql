CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'service');--> statement-breakpoint
CREATE TYPE "public"."evidence_artifact_kind" AS ENUM('original_eml', 'attachment', 'report');--> statement-breakpoint
CREATE TYPE "public"."provider_mode" AS ENUM('fixture', 'offline', 'live');--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"status" "case_status" DEFAULT 'queued' NOT NULL,
	"analysis_version" varchar(64) NOT NULL,
	"rules_version" varchar(64) NOT NULL,
	"model_version" varchar(128),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" varchar(64),
	"failure_message_safe" varchar(512),
	"provider_mode" "provider_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_runs_organization_case_unique" UNIQUE("organization_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"action" varchar(128) NOT NULL,
	"case_id" text,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(128),
	"request_id" varchar(128) NOT NULL,
	"ip_address_masked" varchar(128),
	"metadata_redacted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"kind" "evidence_artifact_kind" NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"encryption_key_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_artifacts_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "evidence_artifacts_sha256_format_check" CHECK ("evidence_artifacts"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_artifacts_byte_size_non_negative_check" CHECK ("evidence_artifacts"."byte_size" >= 0),
	CONSTRAINT "evidence_artifacts_original_eml_non_empty_check" CHECK ("evidence_artifacts"."kind" <> 'original_eml' or "evidence_artifacts"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_organization_case_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_case_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "evidence_artifacts_organization_case_fk" FOREIGN KEY ("organization_id","case_id") REFERENCES "public"."cases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_organization_case_created_at_idx" ON "analysis_runs" USING btree ("organization_id","case_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_runs_status_updated_at_idx" ON "analysis_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "audit_events_organization_created_at_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_organization_case_created_at_idx" ON "audit_events" USING btree ("organization_id","case_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_organization_sha256_idx" ON "evidence_artifacts" USING btree ("organization_id","sha256");--> statement-breakpoint
CREATE INDEX "evidence_artifacts_organization_case_created_at_idx" ON "evidence_artifacts" USING btree ("organization_id","case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_organization_idempotency_key_uidx" ON "cases" USING btree ("organization_id","idempotency_key") WHERE "cases"."idempotency_key" is not null;
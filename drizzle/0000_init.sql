CREATE TYPE "public"."account_type" AS ENUM('bank', 'cash', 'savings');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."compounding" AS ENUM('daily', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."debt_origin" AS ENUM('purchase_untracked', 'purchase_tracked', 'cash_loan');--> statement-breakpoint
CREATE TYPE "public"."split_status" AS ENUM('pending', 'settled');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'debt_payment', 'debt_disbursement');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" text,
	"color" text,
	"icon" text,
	"initial_balance" bigint DEFAULT 0 NOT NULL,
	"interest_enabled" boolean DEFAULT false NOT NULL,
	"interest_annual_rate" numeric(7, 4),
	"interest_compounding" "compounding",
	"interest_start_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_rate_range" CHECK ("accounts"."interest_annual_rate" IS NULL OR ("accounts"."interest_annual_rate" >= 0 AND "accounts"."interest_annual_rate" <= 1))
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "auth_verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"creditor_person_id" uuid,
	"creditor_name" text NOT NULL,
	"description" text NOT NULL,
	"original_amount" bigint NOT NULL,
	"start_date" date NOT NULL,
	"due_date" date,
	"origin" "debt_origin" DEFAULT 'purchase_untracked' NOT NULL,
	"counts_as_expense" boolean DEFAULT true NOT NULL,
	"interest_annual_rate" numeric(7, 4),
	"origin_transaction_id" uuid,
	"color" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_amount_positive" CHECK ("debts"."original_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"status" "split_status" DEFAULT 'pending' NOT NULL,
	"settled_account_id" uuid,
	"settled_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "splits_amount_positive" CHECK ("transaction_splits"."amount" > 0),
	CONSTRAINT "splits_settled_shape" CHECK (("transaction_splits"."status" = 'pending' AND "transaction_splits"."settled_account_id" IS NULL AND "transaction_splits"."settled_date" IS NULL)
       OR ("transaction_splits"."status" = 'settled' AND "transaction_splits"."settled_account_id" IS NOT NULL AND "transaction_splits"."settled_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text,
	"category_id" uuid,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"debt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_shape" CHECK (
        ("transactions"."type" = 'income'
          AND "transactions"."from_account_id" IS NULL AND "transactions"."to_account_id" IS NOT NULL
          AND "transactions"."category_id" IS NOT NULL AND "transactions"."debt_id" IS NULL)
     OR ("transactions"."type" = 'expense'
          AND "transactions"."from_account_id" IS NOT NULL AND "transactions"."to_account_id" IS NULL
          AND "transactions"."category_id" IS NOT NULL AND "transactions"."debt_id" IS NULL)
     OR ("transactions"."type" = 'transfer'
          AND "transactions"."from_account_id" IS NOT NULL AND "transactions"."to_account_id" IS NOT NULL
          AND "transactions"."from_account_id" <> "transactions"."to_account_id"
          AND "transactions"."category_id" IS NULL AND "transactions"."debt_id" IS NULL)
     OR ("transactions"."type" = 'debt_payment'
          AND "transactions"."from_account_id" IS NOT NULL AND "transactions"."to_account_id" IS NULL
          AND "transactions"."category_id" IS NOT NULL AND "transactions"."debt_id" IS NOT NULL)
     OR ("transactions"."type" = 'debt_disbursement'
          AND "transactions"."from_account_id" IS NULL AND "transactions"."to_account_id" IS NOT NULL
          AND "transactions"."category_id" IS NULL AND "transactions"."debt_id" IS NOT NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"locale" text DEFAULT 'es-MX' NOT NULL,
	"seeded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_auth_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_creditor_person_id_people_id_fk" FOREIGN KEY ("creditor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_settled_account_id_accounts_id_fk" FOREIGN KEY ("settled_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_kind_idx" ON "categories" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE INDEX "debts_user_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_user_name_idx" ON "people" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "splits_user_idx" ON "transaction_splits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "splits_transaction_idx" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "splits_person_idx" ON "transaction_splits" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "splits_settled_account_idx" ON "transaction_splits" USING btree ("settled_account_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_from_account_idx" ON "transactions" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "transactions_to_account_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "transactions_debt_idx" ON "transactions" USING btree ("debt_id");
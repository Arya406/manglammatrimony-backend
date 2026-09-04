-- ==============================================================================
-- Manglam Matrimony — Initial Migration
-- PostgreSQL Relational Schema for User Account & Matrimonial Profile Foundation
-- ==============================================================================

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProfileCreatedFor" AS ENUM ('MYSELF', 'MY_SON', 'MY_DAUGHTER', 'MY_BROTHER', 'MY_SISTER', 'MY_RELATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('INCOMPLETE', 'IN_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'AWAITING_DIVORCE', 'ANNULLED');

-- CreateEnum
CREATE TYPE "ManglikStatus" AS ENUM ('YES', 'NO', 'DONT_KNOW', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "AnnualIncomeRange" AS ENUM ('BELOW_2_LAKH', 'TWO_TO_FIVE_LAKH', 'FIVE_TO_TEN_LAKH', 'TEN_TO_FIFTEEN_LAKH', 'FIFTEEN_TO_TWENTY_LAKH', 'TWENTY_TO_THIRTY_LAKH', 'THIRTY_TO_FIFTY_LAKH', 'FIFTY_LAKH_TO_ONE_CRORE', 'ABOVE_ONE_CRORE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "PhotoType" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_created_for" "ProfileCreatedFor" NOT NULL,
    "profile_status" "ProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "completion_percentage" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_personal_details" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "marital_status" "MaritalStatus" NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "mother_tongue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_personal_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_languages" (
    "profile_id" TEXT NOT NULL,
    "language_id" TEXT NOT NULL,

    CONSTRAINT "profile_languages_pkey" PRIMARY KEY ("profile_id","language_id")
);

-- CreateTable
CREATE TABLE "profile_religion" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "religion_id" TEXT NOT NULL,
    "community_id" TEXT,
    "sub_community_id" TEXT,
    "caste_id" TEXT,
    "sub_caste_id" TEXT,
    "gotra_id" TEXT,
    "manglik" "ManglikStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_religion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_education" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "education_id" TEXT NOT NULL,
    "specialization_id" TEXT,
    "institution_id" TEXT,
    "institution_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_career" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "employment_status_id" TEXT NOT NULL,
    "occupation_id" TEXT,
    "company_name" TEXT,
    "employment_type" "EmploymentType",
    "annual_income_range" "AnnualIncomeRange",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_career_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "photo_type" "PhotoType" NOT NULL,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderation_reason" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_preferences" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "min_height_cm" INTEGER,
    "max_height_cm" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_preference_religions" (
    "partner_preference_id" TEXT NOT NULL,
    "religion_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_religions_pkey" PRIMARY KEY ("partner_preference_id","religion_id")
);

-- CreateTable
CREATE TABLE "partner_preference_communities" (
    "partner_preference_id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_communities_pkey" PRIMARY KEY ("partner_preference_id","community_id")
);

-- CreateTable
CREATE TABLE "partner_preference_sub_communities" (
    "partner_preference_id" TEXT NOT NULL,
    "sub_community_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_sub_communities_pkey" PRIMARY KEY ("partner_preference_id","sub_community_id")
);

-- CreateTable
CREATE TABLE "partner_preference_castes" (
    "partner_preference_id" TEXT NOT NULL,
    "caste_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_castes_pkey" PRIMARY KEY ("partner_preference_id","caste_id")
);

-- CreateTable
CREATE TABLE "partner_preference_gotras" (
    "partner_preference_id" TEXT NOT NULL,
    "gotra_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_gotras_pkey" PRIMARY KEY ("partner_preference_id","gotra_id")
);

-- CreateTable
CREATE TABLE "partner_preference_educations" (
    "partner_preference_id" TEXT NOT NULL,
    "education_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_educations_pkey" PRIMARY KEY ("partner_preference_id","education_id")
);

-- CreateTable
CREATE TABLE "partner_preference_occupations" (
    "partner_preference_id" TEXT NOT NULL,
    "occupation_id" TEXT NOT NULL,

    CONSTRAINT "partner_preference_occupations_pkey" PRIMARY KEY ("partner_preference_id","occupation_id")
);

-- CreateTable
CREATE TABLE "partner_preference_manglik" (
    "partner_preference_id" TEXT NOT NULL,
    "manglik" "ManglikStatus" NOT NULL,

    CONSTRAINT "partner_preference_manglik_pkey" PRIMARY KEY ("partner_preference_id","manglik")
);

-- CreateTable
CREATE TABLE "partner_preference_marital_statuses" (
    "partner_preference_id" TEXT NOT NULL,
    "marital_status" "MaritalStatus" NOT NULL,

    CONSTRAINT "partner_preference_marital_statuses_pkey" PRIMARY KEY ("partner_preference_id","marital_status")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "religions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "religions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "religion_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_communities" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "castes" (
    "id" TEXT NOT NULL,
    "community_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "castes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_castes" (
    "id" TEXT NOT NULL,
    "caste_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_castes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gotras" (
    "id" TEXT NOT NULL,
    "community_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gotras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" TEXT NOT NULL,
    "education_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupations" (
    "id" TEXT NOT NULL,
    "employment_status_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_user_id_idx" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_profile_status_idx" ON "profiles"("profile_status");

-- CreateIndex
CREATE INDEX "profiles_profile_created_for_idx" ON "profiles"("profile_created_for");

-- CreateIndex
CREATE UNIQUE INDEX "profile_personal_details_profile_id_key" ON "profile_personal_details"("profile_id");

-- CreateIndex
CREATE INDEX "profile_personal_details_gender_idx" ON "profile_personal_details"("gender");

-- CreateIndex
CREATE INDEX "profile_personal_details_date_of_birth_idx" ON "profile_personal_details"("date_of_birth");

-- CreateIndex
CREATE INDEX "profile_personal_details_height_cm_idx" ON "profile_personal_details"("height_cm");

-- CreateIndex
CREATE INDEX "profile_personal_details_mother_tongue_id_idx" ON "profile_personal_details"("mother_tongue_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_religion_profile_id_key" ON "profile_religion"("profile_id");

-- CreateIndex
CREATE INDEX "profile_religion_religion_id_idx" ON "profile_religion"("religion_id");

-- CreateIndex
CREATE INDEX "profile_religion_community_id_idx" ON "profile_religion"("community_id");

-- CreateIndex
CREATE INDEX "profile_religion_caste_id_idx" ON "profile_religion"("caste_id");

-- CreateIndex
CREATE INDEX "profile_religion_gotra_id_idx" ON "profile_religion"("gotra_id");

-- CreateIndex
CREATE INDEX "profile_religion_manglik_idx" ON "profile_religion"("manglik");

-- CreateIndex
CREATE UNIQUE INDEX "profile_education_profile_id_key" ON "profile_education"("profile_id");

-- CreateIndex
CREATE INDEX "profile_education_education_id_idx" ON "profile_education"("education_id");

-- CreateIndex
CREATE INDEX "profile_education_specialization_id_idx" ON "profile_education"("specialization_id");

-- CreateIndex
CREATE INDEX "profile_education_institution_id_idx" ON "profile_education"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_career_profile_id_key" ON "profile_career"("profile_id");

-- CreateIndex
CREATE INDEX "profile_career_employment_status_id_idx" ON "profile_career"("employment_status_id");

-- CreateIndex
CREATE INDEX "profile_career_occupation_id_idx" ON "profile_career"("occupation_id");

-- CreateIndex
CREATE INDEX "profile_career_annual_income_range_idx" ON "profile_career"("annual_income_range");

-- CreateIndex
CREATE INDEX "profile_photos_profile_id_idx" ON "profile_photos"("profile_id");

-- CreateIndex
CREATE INDEX "profile_photos_moderation_status_idx" ON "profile_photos"("moderation_status");

-- CreateIndex
CREATE INDEX "profile_photos_photo_type_idx" ON "profile_photos"("photo_type");

-- CreateIndex
CREATE UNIQUE INDEX "partner_preferences_profile_id_key" ON "partner_preferences"("profile_id");

-- CreateIndex
CREATE INDEX "partner_preferences_profile_id_idx" ON "partner_preferences"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "religions_slug_key" ON "religions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sub_communities_community_id_slug_key" ON "sub_communities"("community_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sub_castes_caste_id_slug_key" ON "sub_castes"("caste_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "educations_slug_key" ON "educations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "specializations_education_id_slug_key" ON "specializations"("education_id", "slug");

-- CreateIndex
CREATE INDEX "institutions_normalized_name_idx" ON "institutions"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "employment_statuses_slug_key" ON "employment_statuses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "occupations_employment_status_id_slug_key" ON "occupations"("employment_status_id", "slug");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_personal_details" ADD CONSTRAINT "profile_personal_details_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_personal_details" ADD CONSTRAINT "profile_personal_details_mother_tongue_id_fkey" FOREIGN KEY ("mother_tongue_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_languages" ADD CONSTRAINT "profile_languages_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_languages" ADD CONSTRAINT "profile_languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_religion_id_fkey" FOREIGN KEY ("religion_id") REFERENCES "religions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_sub_community_id_fkey" FOREIGN KEY ("sub_community_id") REFERENCES "sub_communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_caste_id_fkey" FOREIGN KEY ("caste_id") REFERENCES "castes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_sub_caste_id_fkey" FOREIGN KEY ("sub_caste_id") REFERENCES "sub_castes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_religion" ADD CONSTRAINT "profile_religion_gotra_id_fkey" FOREIGN KEY ("gotra_id") REFERENCES "gotras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_education_id_fkey" FOREIGN KEY ("education_id") REFERENCES "educations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_career" ADD CONSTRAINT "profile_career_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_career" ADD CONSTRAINT "profile_career_employment_status_id_fkey" FOREIGN KEY ("employment_status_id") REFERENCES "employment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_career" ADD CONSTRAINT "profile_career_occupation_id_fkey" FOREIGN KEY ("occupation_id") REFERENCES "occupations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preferences" ADD CONSTRAINT "partner_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_religions" ADD CONSTRAINT "partner_preference_religions_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_religions" ADD CONSTRAINT "partner_preference_religions_religion_id_fkey" FOREIGN KEY ("religion_id") REFERENCES "religions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_communities" ADD CONSTRAINT "partner_preference_communities_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_communities" ADD CONSTRAINT "partner_preference_communities_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_sub_communities" ADD CONSTRAINT "partner_preference_sub_communities_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_sub_communities" ADD CONSTRAINT "partner_preference_sub_communities_sub_community_id_fkey" FOREIGN KEY ("sub_community_id") REFERENCES "sub_communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_castes" ADD CONSTRAINT "partner_preference_castes_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_castes" ADD CONSTRAINT "partner_preference_castes_caste_id_fkey" FOREIGN KEY ("caste_id") REFERENCES "castes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_gotras" ADD CONSTRAINT "partner_preference_gotras_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_gotras" ADD CONSTRAINT "partner_preference_gotras_gotra_id_fkey" FOREIGN KEY ("gotra_id") REFERENCES "gotras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_educations" ADD CONSTRAINT "partner_preference_educations_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_educations" ADD CONSTRAINT "partner_preference_educations_education_id_fkey" FOREIGN KEY ("education_id") REFERENCES "educations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_occupations" ADD CONSTRAINT "partner_preference_occupations_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_occupations" ADD CONSTRAINT "partner_preference_occupations_occupation_id_fkey" FOREIGN KEY ("occupation_id") REFERENCES "occupations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_manglik" ADD CONSTRAINT "partner_preference_manglik_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_preference_marital_statuses" ADD CONSTRAINT "partner_preference_marital_statuses_partner_preference_id_fkey" FOREIGN KEY ("partner_preference_id") REFERENCES "partner_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_religion_id_fkey" FOREIGN KEY ("religion_id") REFERENCES "religions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_communities" ADD CONSTRAINT "sub_communities_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "castes" ADD CONSTRAINT "castes_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_castes" ADD CONSTRAINT "sub_castes_caste_id_fkey" FOREIGN KEY ("caste_id") REFERENCES "castes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gotras" ADD CONSTRAINT "gotras_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specializations" ADD CONSTRAINT "specializations_education_id_fkey" FOREIGN KEY ("education_id") REFERENCES "educations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupations" ADD CONSTRAINT "occupations_employment_status_id_fkey" FOREIGN KEY ("employment_status_id") REFERENCES "employment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

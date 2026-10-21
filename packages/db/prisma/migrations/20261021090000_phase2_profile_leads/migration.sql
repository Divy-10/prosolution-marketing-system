-- Phase 2: service profile, target market and lead foundation.
-- Additive only: creates new types, tables, indexes and foreign keys.
-- No existing table is altered and no data is inserted, updated or deleted.

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL_RESEARCH', 'REFERRAL', 'INBOUND_ENQUIRY', 'EXISTING_CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadContactStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED');

-- CreateEnum
CREATE TYPE "LeadIdentifierType" AS ENUM ('WEBSITE_DOMAIN', 'PHONE', 'EMAIL', 'INSTAGRAM');

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "publicEmail" TEXT,
    "publicPhone" TEXT,
    "instagramHandle" TEXT,
    "website" TEXT,
    "qualificationNotes" TEXT,
    "requireOnlinePresence" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "leadRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "idealCustomer" TEXT,
    "keyBenefits" TEXT[],
    "exampleOffer" TEXT,
    "cta" TEXT,
    "restrictions" TEXT,
    "portfolioUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "aiGuidance" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryService" (
    "industryId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "IndustryService_pkey" PRIMARY KEY ("industryId","serviceId")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "displayId" SERIAL NOT NULL,
    "businessName" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "industryId" TEXT,
    "cityId" TEXT,
    "areaId" TEXT,
    "addressLine" TEXT,
    "website" TEXT,
    "instagramHandle" TEXT,
    "publicPhone" TEXT,
    "publicEmail" TEXT,
    "source" "LeadSource" NOT NULL,
    "sourceUrl" TEXT,
    "sourceNote" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "reviewStatus" "LeadReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "contactStatus" "LeadContactStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "contactedAt" TIMESTAMP(3),
    "contactNote" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "doNotContactReason" TEXT,
    "doNotContactAt" TIMESTAMP(3),
    "detailsVerifiedAt" TIMESTAMP(3),
    "detailsVerifiedById" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "retentionHoldUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadIdentifier" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeadIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_nameKey_key" ON "Service"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_nameKey_key" ON "Industry"("nameKey");

-- CreateIndex
CREATE INDEX "IndustryService_serviceId_idx" ON "IndustryService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "City_nameKey_key" ON "City"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Area_cityId_nameKey_key" ON "Area"("cityId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_displayId_key" ON "Lead"("displayId");

-- CreateIndex
CREATE INDEX "Lead_reviewStatus_contactStatus_idx" ON "Lead"("reviewStatus", "contactStatus");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_industryId_idx" ON "Lead"("industryId");

-- CreateIndex
CREATE INDEX "Lead_areaId_idx" ON "Lead"("areaId");

-- CreateIndex
CREATE INDEX "Lead_nameKey_idx" ON "Lead"("nameKey");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "LeadIdentifier_type_value_idx" ON "LeadIdentifier"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "LeadIdentifier_leadId_type_key" ON "LeadIdentifier"("leadId", "type");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryService" ADD CONSTRAINT "IndustryService_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryService" ADD CONSTRAINT "IndustryService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_detailsVerifiedById_fkey" FOREIGN KEY ("detailsVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadIdentifier" ADD CONSTRAINT "LeadIdentifier_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

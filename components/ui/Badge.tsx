"use client";

/**
 * components/ui/Badge.tsx
 *
 * Status badge for audit check statuses and overall audit scores.
 *
 * Color mapping:
 *   confirmed → green  (status is satisfied)
 *   missing   → amber  (evidence not found — not a confirmed problem)
 *   problem   → red    (evidence indicates a reproducibility risk)
 *
 *   good      → green
 *   partial   → amber
 *   poor      → red
 *
 * Text labels are always visible so meaning does not depend on color alone.
 */

import React from "react";
import type { AuditStatus, AuditScore } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeVariant = AuditStatus | AuditScore;

// ---------------------------------------------------------------------------
// Variant → display config
// ---------------------------------------------------------------------------

interface BadgeConfig {
  label: string;
  classes: string;
}

const BADGE_CONFIG: Record<BadgeVariant, BadgeConfig> = {
  // AuditStatus values
  confirmed: {
    label: "Confirmed",
    classes:
      "bg-green-50 text-green-800 border border-green-200",
  },
  missing: {
    label: "Missing",
    classes:
      "bg-amber-50 text-amber-800 border border-amber-200",
  },
  problem: {
    label: "Problem",
    classes:
      "bg-red-50 text-red-800 border border-red-200",
  },
  // AuditScore values
  good: {
    label: "Good",
    classes:
      "bg-green-50 text-green-800 border border-green-200",
  },
  partial: {
    label: "Partial",
    classes:
      "bg-amber-50 text-amber-800 border border-amber-200",
  },
  poor: {
    label: "Poor",
    classes:
      "bg-red-50 text-red-800 border border-red-200",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BadgeProps {
  variant: BadgeVariant;
  /** Override the default label text. */
  label?: string;
  className?: string;
}

export function Badge({ variant, label, className = "" }: BadgeProps) {
  const config = BADGE_CONFIG[variant];
  const displayLabel = label ?? config.label;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${config.classes} ${className}`}
    >
      {displayLabel}
    </span>
  );
}

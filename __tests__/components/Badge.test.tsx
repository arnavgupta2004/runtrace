/**
 * __tests__/components/Badge.test.tsx
 *
 * Tests for components/ui/Badge.tsx
 *
 * Covers all status and score variants, color classes, and text labels.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "@/components/ui/Badge";

describe("Badge — AuditStatus variants", () => {
  it('renders "Confirmed" label for confirmed status', () => {
    render(<Badge variant="confirmed" />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it('renders "Missing" label for missing status', () => {
    render(<Badge variant="missing" />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it('renders "Problem" label for problem status', () => {
    render(<Badge variant="problem" />);
    expect(screen.getByText("Problem")).toBeInTheDocument();
  });

  it("applies green classes for confirmed", () => {
    render(<Badge variant="confirmed" />);
    const badge = screen.getByText("Confirmed");
    expect(badge.className).toMatch(/green/);
  });

  it("applies amber classes for missing", () => {
    render(<Badge variant="missing" />);
    const badge = screen.getByText("Missing");
    expect(badge.className).toMatch(/amber/);
  });

  it("applies red classes for problem", () => {
    render(<Badge variant="problem" />);
    const badge = screen.getByText("Problem");
    expect(badge.className).toMatch(/red/);
  });
});

describe("Badge — AuditScore variants", () => {
  it('renders "Good" label for good score', () => {
    render(<Badge variant="good" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it('renders "Partial" label for partial score', () => {
    render(<Badge variant="partial" />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });

  it('renders "Poor" label for poor score', () => {
    render(<Badge variant="poor" />);
    expect(screen.getByText("Poor")).toBeInTheDocument();
  });

  it("applies green classes for good", () => {
    render(<Badge variant="good" />);
    const badge = screen.getByText("Good");
    expect(badge.className).toMatch(/green/);
  });

  it("applies amber classes for partial", () => {
    render(<Badge variant="partial" />);
    const badge = screen.getByText("Partial");
    expect(badge.className).toMatch(/amber/);
  });

  it("applies red classes for poor", () => {
    render(<Badge variant="poor" />);
    const badge = screen.getByText("Poor");
    expect(badge.className).toMatch(/red/);
  });
});

describe("Badge — custom label override", () => {
  it("renders a custom label when provided", () => {
    render(<Badge variant="confirmed" label="OK" />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("does not show the default label when a custom label is provided", () => {
    render(<Badge variant="confirmed" label="OK" />);
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
  });
});

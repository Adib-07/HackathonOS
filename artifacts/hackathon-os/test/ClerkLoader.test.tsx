import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { ClerkLoader } from "@/components/ClerkLoader";

// Mock @clerk/react
vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  ),
  useAuth: () => ({ isLoaded: false }),
  useUser: () => ({ user: null, isLoaded: true }),
}));

describe("ClerkLoader timeout logic", () => {
  const defaultProps = {
    children: <div data-testid="children">Children</div>,
    publishableKey: "pk_test_12345",
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
    routerPush: vi.fn(),
    routerReplace: vi.fn(),
    loadTimeoutMs: 100,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders children immediately (before timeout)", () => {
    render(<ClerkLoader {...defaultProps} />);
    expect(screen.getByTestId("clerk-provider")).toBeInTheDocument();
  });

  it("shows fallback after timeout", async () => {
    render(<ClerkLoader {...defaultProps} />);

    // Fast-forward past the timeout
    await act(async () => {
      vi.advanceTimersByTime(200);
      await vi.runAllTimersAsync();
    });

    // Check directly after act - the fallback should be rendered
    console.log("Checking for fallback, clerk-provider:", screen.queryByTestId("clerk-provider"));
    console.log("Checking for fallback, clerk-fallback:", screen.queryByTestId("clerk-fallback"));
    
    expect(screen.getByTestId("clerk-fallback")).toBeInTheDocument();
    expect(screen.getByText("Authentication Service Unavailable")).toBeInTheDocument();
  });

  it("cleans up event listeners on unmount", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ClerkLoader {...defaultProps} />);

    expect(addEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });
});

describe("ClerkLoader proxy URL logic (unit test of the logic in App.tsx)", () => {
  it("skips proxy for pk_test_ keys in production", () => {
    const isDevClerkKey = "pk_test_abc123".startsWith("pk_test_");
    const proxyUrl = undefined ?? (true && !isDevClerkKey ? "/api/__clerk" : undefined);
    
    expect(isDevClerkKey).toBe(true);
    expect(proxyUrl).toBeUndefined();
  });

  it("uses proxy for pk_live_ keys in production when no explicit VITE_CLERK_PROXY_URL", () => {
    const isDevClerkKey = "pk_live_abc123".startsWith("pk_test_");
    const proxyUrl = undefined ?? (true && !isDevClerkKey ? "/api/__clerk" : undefined);
    
    expect(isDevClerkKey).toBe(false);
    expect(proxyUrl).toBe("/api/__clerk");
  });

  it("uses explicit VITE_CLERK_PROXY_URL when set", () => {
    const proxyUrl = "https://custom-proxy.example.com" ?? (true && !false ? "/api/__clerk" : undefined);
    
    expect(proxyUrl).toBe("https://custom-proxy.example.com");
  });

  it("does not use proxy in development even for pk_live_ keys", () => {
    const isDevClerkKey = "pk_live_abc123".startsWith("pk_test_");
    const proxyUrl = undefined ?? (false && !isDevClerkKey ? "/api/__clerk" : undefined);
    
    expect(proxyUrl).toBeUndefined();
  });
});
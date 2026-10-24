// Verifies the documented response protections apply to every route without adding CORS policy.
// Called by: npm test; imports configuration without starting a server
import { expect, it } from "vitest";
import nextConfig from "../../next.config";

it("sets the five required security headers for every path", async () => {
  expect(nextConfig.headers).toBeTypeOf("function");
  const routes = await nextConfig.headers!();
  expect(routes).toHaveLength(1);
  expect(routes[0].source).toBe("/:path*");
  expect(routes[0].headers).toHaveLength(5);
  const headers = Object.fromEntries(routes[0].headers.map(({ key, value }) => [key, value]));
  expect(headers).toEqual({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  expect(Object.keys(headers).some((key) => key.toLowerCase().startsWith("access-control-"))).toBe(false);
});

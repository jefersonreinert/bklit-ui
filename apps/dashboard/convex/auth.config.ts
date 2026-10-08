import type { AuthConfig } from "convex/server";

/**
 * The panel signs its own short-lived JWTs (ES256) after the access code is
 * entered; Convex checks them against the panel's public JWKS.
 */
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "casa-brasa",
      issuer: process.env.PANEL_AUTH_ISSUER as string,
      jwks: process.env.PANEL_AUTH_JWKS_URL as string,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;

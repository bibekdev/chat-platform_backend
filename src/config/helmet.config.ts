import { HelmetOptions } from 'helmet';

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

const connectSrc = ["'self'", ...allowedOrigins];

export const helmetSecurityConfigOptions: HelmetOptions = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Allow inline styles (adjust as needed)
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net',
      ],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: connectSrc,
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false,
  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },
  // Frameguard (X-Frame-Options)
  frameguard: { action: 'deny' },
  // Hide Powered-By header
  hidePoweredBy: true,
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // IE No Open
  ieNoOpen: true,
  // Don't Sniff Mimetype
  noSniff: true,
  // Origin Agent Cluster
  originAgentCluster: true,
  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: false,
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-XSS-Protection
  xssFilter: true,
};

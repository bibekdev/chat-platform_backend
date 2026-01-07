const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

export const corsConfig = {
  // This function checks if the origin is in the allowed origins list
  origin: function (
    origin: string | undefined,
    callback: (error: Error | null, allowed?: boolean) => void
  ) {
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Allow specific headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key',
  ],
  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Cache preflight requests for 24 hours
  maxAge: 86400,

  // Enable preflight for all routes
  preflightContinue: false,

  // Provide a successful response for preflight requests
  optionsSuccessStatus: 204,
};

const express = require('express'); // Ensure express is imported
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

const applyMiddlewares = (app) => {
  // Middleware to generate a nonce for CSP
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Security middleware with CSP including nonce
  app.use((req, res, next) => {
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://code.highcharts.com", `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://api.etherscan.io", "https://mainnet.infura.io"],
      },
    })(req, res, next);
  });

  // Set 'trust proxy' to specific addresses
  app.set('trust proxy', '127.0.0.1'); // Change this to your specific proxy address if needed

  // Rate limiting middleware to limit requests from each IP
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    keyGenerator: (req, res) => req.ip
  });
  app.use(limiter);

  // Enable CORS for all routes
  app.use(cors());

  // Middleware to parse JSON
  app.use(express.json());
};

module.exports = { applyMiddlewares };

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');
const ethers = require('ethers');

const app = express();
const port = process.env.PORT || 3000;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
const startingEthBalance = parseFloat(process.env.STARTING_ETH_BALANCE) || 0;

// Ethereum addresses
const trumpAddress = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

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
      connectSrc: ["'self'", "https://api.etherscan.io"],
    },
  })(req, res, next);
});

// Set 'trust proxy' to specific addresses
app.set('trust proxy', '127.0.0.1');

// Rate limiting middleware to limit requests from each IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: (req, res) => req.ip, // Customize key generator to trust specific IP addresses
});
app.use(limiter);

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON
app.use(express.json());

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Cache object to store data
let cache = {
  '1d': null,
  '7d': null,
  '30d': null,
  'custom': null,
};
let lastCacheUpdateTime = 0;
const cacheDuration = 1800000; // 30 minutes

// Rate Limiter class implementation
class RateLimiter {
  constructor(limit, interval) {
    this.limit = limit;
    this.interval = interval;
    this.tokens = limit;
    this.lastRefill = Date.now();
  }

  acquireToken() {
    this.refillTokens();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  refillTokens() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > this.interval) {
      const tokensToAdd = Math.floor(elapsed / this.interval) * this.limit;
      this.tokens = Math.min(this.tokens + tokensToAdd, this.limit);
      this.lastRefill = now;
    }
  }
}

// Instantiate the rate limiter with a limit of 2 calls per second (more conservative)
const rateLimiter = new RateLimiter(2, 1000);

// Function to make a rate-limited API call with retry mechanism
async function rateLimitedApiCall(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    if (rateLimiter.acquireToken()) {
      try {
        const response = await axios.get(url);
        return response;
      } catch (error) {
        if (error.response) {
          if (error.response.status === 502 && i < retries - 1) {
            console.warn(`502 Bad Gateway, retrying... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** i))); // Exponential backoff
          } else if (error.response.data.result === 'Max rate limit reached' && i < retries - 1) {
            console.warn(`Rate limit reached, retrying... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** i))); // Exponential backoff
          } else {
            console.error('Error making API call:', error.message);
            console.error('Full Error:', error.response ? error.response.data : error);
            throw error;
          }
        } else {
          console.error('Error making API call:', error.message);
          throw error;
        }
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 500ms before trying again
    }
  }
  throw new Error('Max retries reached');
}

// Function to fetch internal transactions from Etherscan
async function fetchInternalTransactionsEtherscan(fromAddress, toAddress) {
  try {
    const response = await rateLimitedApiCall(`https://api.etherscan.io/api?module=account&action=txlistinternal&address=${toAddress}&startblock=0&endblock=latest&sort=asc&apikey=${etherscanApiKey}`);
    if (response.data.status === "1") {
      return response.data.result.filter(tx => tx.from.toLowerCase() === fromAddress.toLowerCase());
    } else {
      console.error('Etherscan API Error:', response.data.message);
      console.log('Full Response:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching internal transactions from Etherscan:', error);
    return [];
  }
}

// Function to update the cache
async function updateCache() {
  const currentTime = Date.now();
  if (currentTime - lastCacheUpdateTime < cacheDuration) {
    console.log('Cache is up to date.');
    return; // Skip updating the cache if it was updated recently
  }
  lastCacheUpdateTime = currentTime;

  try {
    // Fetch internal transactions (single API call)
    const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, trumpAddress);

    // Calculate cumulative ETH generated
    const cumulativeEthGenerated = calculateCumulativeEthGenerated(internalTransactions, 30, 6500, 24);

    // Calculate contract balance
    const contractBalance = internalTransactions.reduce((total, tx) => {
      const value = tx.value.toString();
      const integerPart = value.slice(0, -18) || '0';
      const decimalPart = value.slice(-18).padStart(18, '0');
      const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
      return total + formattedValue;
    }, 0).toFixed(4);

    // Generate time labels
    const labels = generateTimeLabels(30, 24);

    // Calculate deltas for cumulative ETH generated
    const ethDelta = calculateDeltas(cumulativeEthGenerated);

    // Update the cache
    cache['custom'] = {
      labels,
      trumpEtherIncomeDuringTimeFrame: cumulativeEthGenerated,
      etherIncomeFromContract: ethDelta,
      trumpTotalEther: parseFloat(contractBalance),
      totalEtherFromDJT: ethDelta,
    };

    console.log('Cache updated at', new Date());
  } catch (error) {
    console.error('Error updating cache:', error);
  }
}

// Initial cache update
updateCache().catch(console.error); // Catch and log any errors

// Update cache every 30 minutes
setInterval(() => {
  updateCache().catch(console.error); // Catch and log any errors
}, cacheDuration);

// API endpoint to fetch data based on time frame
app.get('/api/data', (req, res) => {
  const { timeFrame, simulate } = req.query;
  console.log(`Received request for timeFrame: ${timeFrame} with simulate: ${simulate}`);

  if (cache[timeFrame]) {
    if (simulate && simulate === 'false') {
      res.json(cache[timeFrame]);
    } else if (simulate && simulate === 'true') {
      const simulatedData = JSON.parse(JSON.stringify(cache[timeFrame])); // Deep clone the cache data
      simulatedData.cumulativeEthGenerated = simulatedData.cumulativeEthGenerated.map(value => value * 1.1); // Example simulation
      res.json(simulatedData);
    } else {
      res.json(cache[timeFrame]);
    }
  } else {
    res.status(400).json({ error: 'Invalid time frame' });
  }
});

// Calculate cumulative ETH generated from transactions
function calculateCumulativeEthGenerated(transactions, length, currentBlock, blocksPerInterval, interval) {
  const cumulativeEthGenerated = new Array(length + 1).fill(0);
  transactions.forEach(tx => {
    const value = tx.value.toString();
    const integerPart = value.slice(0, -18) || '0';
    const decimalPart = value.slice(-18).padStart(18, '0');
    const ethValue = parseFloat(`${integerPart}.${decimalPart}`);
    cumulativeEthGenerated.forEach((_, index) => {
      cumulativeEthGenerated[index] += ethValue;
    });
  });
  return cumulativeEthGenerated;
}

// Calculate deltas
function calculateDeltas(data) {
  const deltas = new Array(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    deltas[i] = data[i] - data[i - 1];
  }
  return deltas;
}

// Generate time labels
function generateTimeLabels(days, interval) {
  const labels = [];
  const currentDate = new Date();
  for (let i = 0; i <= interval; i++) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - (days / interval) * i);
    labels.push(date.toISOString().split('T')[0]);
  }
  return labels.reverse();
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

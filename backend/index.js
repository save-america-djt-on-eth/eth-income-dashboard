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

// Instantiate the rate limiter with a limit of 5 calls per second
const rateLimiter = new RateLimiter(5, 1000);

// Function to make a rate-limited API call
async function rateLimitedApiCall(url) {
  return new Promise((resolve, reject) => {
    const attemptCall = () => {
      if (rateLimiter.acquireToken()) {
        axios.get(url)
          .then(response => resolve(response))
          .catch(error => {
            if (error.response && error.response.data) {
              console.error('Etherscan API Response Error:', error.response.data);
            } else {
              console.error('Error making API call:', error.message);
            }
            reject(error);
          });
      } else {
        setTimeout(attemptCall, 100); // Retry after 100ms if no tokens are available
      }
    };
    attemptCall();
  });
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
    // Fetch current block number
    const blockUrl = `https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${etherscanApiKey}`;
    const blockResponse = await rateLimitedApiCall(blockUrl);
    const currentBlock = parseInt(blockResponse.data.result, 16);

    // Fetch current balance of Trump's address
    const balanceUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${trumpAddress}&tag=latest&apikey=${etherscanApiKey}`;
    const balanceResponse = await rateLimitedApiCall(balanceUrl);

    if (balanceResponse.data.status !== "1") {
      console.error(`Etherscan API Error: ${balanceResponse.data.message}`);
      console.log('Full Response:', balanceResponse.data);
      throw new Error(`Etherscan API Error: ${balanceResponse.data.message}`);
    }

    const currentTrumpBalance = balanceResponse.data.result;
    const currentEthBalance = parseFloat(ethers.formatEther(currentTrumpBalance));

    // Define block intervals
    const blocksPerDay = 6500;
    const blocksPerHour = Math.round(blocksPerDay / 24);
    const blocksPer6Hours = Math.round(blocksPerDay / 4);

    // Generate data for a specific time frame
    const generateData = async (timeFrame) => {
      let days, interval, blocksPerInterval, startDate, endDate;
      let labels = [];
      switch (timeFrame) {
        case '1d':
          days = 1;
          interval = 24;
          blocksPerInterval = blocksPerHour;
          labels = generateTimeLabels(days, interval);
          break;
        case '7d':
          days = 7;
          interval = 28;
          blocksPerInterval = blocksPer6Hours;
          labels = generateTimeLabels(days, interval);
          break;
        case '30d':
          days = 30;
          interval = 30;
          blocksPerInterval = blocksPerDay;
          labels = generateTimeLabels(days, interval);
          break;
        case 'custom':
          startDate = new Date('2024-03-20');
          endDate = new Date();
          days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
          interval = 30;
          blocksPerInterval = Math.floor((blocksPerDay * days) / interval);
          labels = generateCustomTimeLabels(startDate, endDate, interval);
          break;
        default:
          throw new Error('Invalid time frame');
      }

      const trumpEtherIncomeDuringTimeFrame = new Array(interval + 1).fill(startingEthBalance);
      const etherIncomeFromContract = new Array(interval + 1).fill(0);

      // Fetch balances for each interval
      for (let i = interval; i >= 0; i--) {
        const blockNumber = currentBlock - (i * blocksPerInterval);
        const balanceUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${trumpAddress}&tag=${blockNumber}&apikey=${etherscanApiKey}`;
        try {
          const response = await rateLimitedApiCall(balanceUrl);
          if (response.data.status !== "1") {
            console.error(`Etherscan API Error: ${response.data.message}`);
            console.log('Full Response:', response.data);
            trumpEtherIncomeDuringTimeFrame[interval - i] = 0;
          } else {
            const balance = response.data.result;
            const ethBalance = parseFloat(ethers.formatEther(balance));
            trumpEtherIncomeDuringTimeFrame[interval - i] = ethBalance;
          }
        } catch (error) {
          console.error(`Error fetching balance for block ${blockNumber}:`, error);
          trumpEtherIncomeDuringTimeFrame[interval - i] = 0;
        }
      }

      // Fetch internal transactions from contract address
      const contractTransactions = await fetchContractTransactionsEtherscan(contractAddress, trumpAddress);

      // Calculate cumulative ETH generated by DJT
      const cumulativeEthGeneratedByDJT = calculateCumulativeEthGeneratedByDJT(contractTransactions, interval);

      // Calculate ETH generated by DJT during the timeframe
      cumulativeEthGeneratedByDJT.forEach((value, index) => {
        if (index > 0) {
          etherIncomeFromContract[index] = value - cumulativeEthGeneratedByDJT[index - 1];
        } else {
          etherIncomeFromContract[index] = value;
        }
      });

      // Make ETH values cumulative and adjust starting point
      const cumulativeEthAddedDuringTimeFrame = trumpEtherIncomeDuringTimeFrame.reduce((acc, value, index) => {
        if (index === 0) {
          acc.push(startingEthBalance); // Start with the initial balance
        } else {
          acc.push(acc[index - 1] + (value - trumpEtherIncomeDuringTimeFrame[index - 1]));
        }
        return acc;
      }, []);
      const cumulativeEthGeneratedByDJTFinal = etherIncomeFromContract.reduce((acc, value, index) => {
        if (index === 0) {
          acc.push(0); // Start with 0
        } else {
          acc.push(acc[index - 1] + value);
        }
        return acc;
      }, []);

      return {
        labels,
        trumpEtherIncomeDuringTimeFrame: cumulativeEthAddedDuringTimeFrame,
        etherIncomeFromContract: cumulativeEthGeneratedByDJTFinal,
        trumpTotalEther: currentEthBalance,
        totalEtherFromDJT: cumulativeEthGeneratedByDJTFinal,
      };
    };

    // Update cache for each time frame
    cache['1d'] = await generateData('1d');
    cache['7d'] = await generateData('7d');
    cache['30d'] = await generateData('30d');
    cache['custom'] = await generateData('custom');

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

// Fetch internal transactions from Etherscan
async function fetchContractTransactionsEtherscan(fromAddress, toAddress) {
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

// Calculate cumulative ETH generated from transactions
function calculateCumulativeEthGeneratedByDJT(transactions, interval) {
  const cumulativeEthGeneratedByDJT = new Array(interval + 1).fill(0);
  transactions.forEach(tx => {
    const value = tx.value.toString();
    const integerPart = value.slice(0, -18) || '0';
    const decimalPart = value.slice(-18).padStart(18, '0');
    const ethValue = parseFloat(`${integerPart}.${decimalPart}`);
    cumulativeEthGeneratedByDJT.forEach((_, index) => {
      cumulativeEthGeneratedByDJT[index] += ethValue;
    });
  });
  return cumulativeEthGeneratedByDJT;
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

// Generate custom time labels
function generateCustomTimeLabels(startDate, endDate, interval) {
  const labels = [];
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  for (let i = 0; i <= interval; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + (totalDays / interval) * i);
    labels.push(date.toISOString().split('T')[0]);
  }
  return labels.reverse();
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

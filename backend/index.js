require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

// Load variables from .env
const app = express();
const port = process.env.PORT || 3000;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;

// Function to wait for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  keyGenerator: (req, res) => {
    return req.ip; // Customize key generator to trust specific IP addresses
  }
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
  'custom': null
};
let lastCacheUpdateTime = 0;
const cacheDuration = 1800000; // 30 minutes

// Helper function to get Unix timestamp
const getUnixTimestamp = date => Math.floor(new Date(date).getTime() / 1000);

// Function to return historic block number
async function returnHistoricBlock(date) {
  const unixTime = getUnixTimestamp(date);
  const apiCall = `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${unixTime}&closest=before&apikey=${etherscanApiKey}`;
  const response = await axios.get(apiCall);
  return response.data.result;
}

// Function to return historic balance
async function returnHistoricBalance(date, ethAddress) {
  const historicBlock = await returnHistoricBlock(date);
  const apiCall = `https://api.etherscan.io/api?module=account&action=balancehistory&address=${ethAddress}&blockno=${historicBlock}&apikey=${etherscanApiKey}`;
  const response = await axios.get(apiCall);
  return response.data.result;
}

// Function to fetch internal transactions from Etherscan
async function fetchInternalTransactionsEtherscan(fromAddress, toAddress, startBlock, endBlock) {
  const apiCall = `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${toAddress}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${etherscanApiKey}`;
  const response = await axios.get(apiCall);
  return response.data.result;
}

// Function to update the cache
async function updateCache() {
  const currentTime = Date.now();
  if (currentTime - lastCacheUpdateTime < cacheDuration) {
    console.log('Cache is up to date.');
    return; // Skip updating the cache if it was updated recently
  }
  lastCacheUpdateTime = currentTime;

  // Ethereum addresses
  const trumpAddress = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
  const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

  try {
    // Fetch current block number
    const currentBlock = await returnHistoricBlock(new Date());
    // Fetch current balance of Trump's address
    const currentEthBalance = await returnHistoricBalance(new Date(), trumpAddress);
    // Define block intervals
    const blocksPerDay = 6500;
    const blocksPerHour = Math.round(blocksPerDay / 24);
    const blocksPer6Hours = Math.round(blocksPerDay / 4);

    // Function to generate data for a specific time frame
    const generateData = async (timeFrame) => {
      let days, interval, blocksPerInterval, startDate, endDate;
      switch (timeFrame) {
        case '1d':
          days = 1;
          interval = 24;
          blocksPerInterval = blocksPerHour;
          break;
        case '7d':
          days = 7;
          interval = 28;
          blocksPerInterval = blocksPer6Hours;
          break;
        case '30d':
          days = 30;
          interval = 30;
          blocksPerInterval = blocksPerDay;
          break;
        case 'custom':
          startDate = new Date('2024-03-20');
          endDate = new Date();
          days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
          interval = 30;
          blocksPerInterval = Math.floor((blocksPerDay * days) / interval);
          break;
        default:
          console.error(`Invalid time frame: ${timeFrame}`);
          throw new Error('Invalid time frame');
      }

      const supplyChange = [];
      const labels = [];
      let previousBalance = null;

      for (let i = interval; i >= 0; i--) {
        const date = new Date(new Date().getTime() - (i * (days * 24 * 60 * 60 * 1000) / interval));
        const ethBalance = await returnHistoricBalance(date, trumpAddress);
        labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
        if (previousBalance !== null) {
          supplyChange.push(previousBalance - ethBalance);
        }
        previousBalance = ethBalance;
      }

      const startBlock = await returnHistoricBlock(startDate);
      const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, trumpAddress, startBlock, currentBlock);

      // Calculate cumulative ETH generated
      const cumulativeEthGenerated = calculateCumulativeEthGenerated(internalTransactions, supplyChange.length, currentBlock, blocksPerInterval, interval);

      // Calculate contract balance
      const contractBalance = internalTransactions.reduce((total, tx) => {
        const value = tx.value.toString();
        const integerPart = value.slice(0, -18) || '0';
        const decimalPart = value.slice(-18).padStart(18, '0');
        const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
        return total + formattedValue;
      }, 0).toFixed(4);

      const supplyDelta = calculateDeltas(supplyChange);
      const djtDelta = calculateDeltas(cumulativeEthGenerated);

      const djtData = generateRandomData(labels.length);
      const nftData = generateRandomData(labels.length);
      const otherData = generateRandomData(labels.length);

      return {
        labels: labels.slice(1),
        djt: djtData,
        nft: nftData,
        other: otherData,
        supplyChange: supplyDelta,
        cumulativeEthGenerated: djtDelta,
        contractBalance,
        currentEthTotal: currentEthBalance
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
updateCache();

// Update cache every 30 minutes
setInterval(updateCache, cacheDuration);

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
    console.error(`Invalid time frame requested: ${timeFrame}`);
    res.status(400).json({ error: 'Invalid time frame' });
  }
});

// API endpoint to fetch the current cache state
app.get('/api/cache', (req, res) => {
  res.json(cache);
});

// Fetch internal transactions from Etherscan
async function fetchInternalTransactionsEtherscan(fromAddress, toAddress, startBlock, endBlock) {
  const apiCall = `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${toAddress}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${etherscanApiKey}`;
  const response = await axios.get(apiCall);
  return response.data.result;
}

// Calculate cumulative ETH generated from transactions
function calculateCumulativeEthGenerated(transactions, length, currentBlock, blocksPerInterval, interval) {
  const cumulativeEthGenerated = new Array(length).fill(0);
  transactions.forEach(tx => {
    const value = tx.value.toString();
    const integerPart = value.slice(0, -18) || '0';
    const decimalPart = value.slice(-18).padStart(18, '0');
    const ethValue = parseFloat(`${integerPart}.${decimalPart}`);
    const blockNumber = parseInt(tx.blockNumber);

    for (let i = 0; i < length; i++) {
      const blockThreshold = currentBlock - ((interval - i) * blocksPerInterval);
      if (blockNumber <= blockThreshold) {
        cumulativeEthGenerated[i] += ethValue;
      }
    }
  });
  return cumulativeEthGenerated;
}

// Generate time labels based on days and interval
function generateTimeLabels(days, interval) {
  const labels = [];
  const today = new Date();
  const msPerInterval = (days * 24 * 60 * 60 * 1000) / interval;
  for (let i = interval; i >= 0; i--) {
    const date = new Date(today.getTime() - (i * msPerInterval));
    labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
  }
  return labels;
}

// Generate custom time labels based on start and end dates
function generateCustomTimeLabels(startDate, endDate, interval) {
  const labels = [];
  const msPerInterval = (endDate - startDate) / interval;
  for (let i = 0; i <= interval; i++) {
    const date = new Date(startDate.getTime() + (i * msPerInterval));
    labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
  }
  return labels;
}

// Calculate deltas for data
function calculateDeltas(data) {
  const deltas = [];
  for (let i = 1; i < data.length; i++) {
    deltas.push(data[i - 1] + (data[i] - data[i - 1]));
  }
  return deltas;
}

// Generate random data for demonstration purposes
function generateRandomData(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

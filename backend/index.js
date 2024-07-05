const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');
const app = express();
const port = process.env.PORT || 3000;

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

// Use the Infura API key from .env file
const infuraApiKey = process.env.INFURA_API_KEY;
const providerUrl = `https://mainnet.infura.io/v3/${infuraApiKey}`;
console.log(`Using provider URL: ${providerUrl}`);

const provider = new ethers.JsonRpcProvider(providerUrl);

// Cache object to store data
let cache = {
  '1d': null,
  '7d': null,
  '30d': null,
  'custom': null
};
let lastCacheUpdateTime = 0;
const cacheDuration = 1800000; // 30 minutes

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
    // Fetch current balance of Trump's address
    const currentTrumpBalance = await provider.getBalance(trumpAddress);
    const currentEthBalance = parseFloat(parseFloat(ethers.formatEther(currentTrumpBalance)).toFixed(4));
    const currentBlock = await provider.getBlockNumber();

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

      const trumpEtherTotal = [];
      const ethAddedDuringTimeFrame = [];
      const ethGeneratedByDJT = [];

      for (let i = interval; i >= 0; i--) {
        const blockNumber = currentBlock - (i * blocksPerInterval);
        try {
          const balance = await provider.getBalance(trumpAddress, blockNumber);
          const ethBalance = parseFloat(ethers.formatEther(balance));
          trumpEtherTotal.push(ethBalance);

          // Calculate ETH added during the timeframe
          const previousBalance = i < interval ? trumpEtherTotal[trumpEtherTotal.length - 2] : ethBalance;
          const ethAdded = ethBalance - previousBalance;
          ethAddedDuringTimeFrame.push(ethAdded);
        } catch (error) {
          console.error(`Error fetching balance for block ${blockNumber}:`, error);
          trumpEtherTotal.push(0);
          ethAddedDuringTimeFrame.push(0);
        }
      }

      // Fetch internal transactions
      const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, trumpAddress);

      // Calculate cumulative ETH generated
      const cumulativeEthGenerated = calculateCumulativeEthGenerated(internalTransactions, trumpEtherTotal.length, currentBlock, blocksPerInterval, interval);

      // Calculate ETH generated by DJT during the timeframe
      cumulativeEthGenerated.forEach((value, index) => {
        if (index > 0) {
          ethGeneratedByDJT.push(value - cumulativeEthGenerated[index - 1]);
        } else {
          ethGeneratedByDJT.push(value);
        }
      });

      // Calculate cumulative values
      let cumulativeEthAddedNonDJT = 0;
      ethAddedDuringTimeFrame.forEach((value, index) => {
        cumulativeEthAddedNonDJT += value;
        ethAddedDuringTimeFrame[index] = cumulativeEthAddedNonDJT;
      });

      let cumulativeEthGenerated = 0;
      ethGeneratedByDJT.forEach((value, index) => {
        cumulativeEthGenerated += value;
        ethGeneratedByDJT[index] = cumulativeEthGenerated;
      });

      // Calculate contract balance
      const generatedEth = internalTransactions.reduce((total, tx) => {
        const value = tx.value.toString();
        const integerPart = value.slice(0, -18) || '0';
        const decimalPart = value.slice(-18).padStart(18, '0');
        const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
        return total + formattedValue;
      }, 0).toFixed(4);

      // Generate time labels
      const labels = timeFrame === 'custom' ? generateCustomTimeLabels(startDate, endDate, interval) : generateTimeLabels(days, interval);

      // Calculate new ETH holdings and DJT generated ETH for the time frame
      const newEthHoldings = trumpEtherTotal[trumpEtherTotal.length - 1] - trumpEtherTotal[0];
      const newEthGeneratedDJT = cumulativeEthGenerated[cumulativeEthGenerated.length - 1] - cumulativeEthGenerated[0];

      return {
        labels, // Keep all labels for better comparison
        ethAddedDuringTimeFrame, // New total ETH added during the timeframe
        ethGeneratedByDJT, // New ETH generated by DJT during the timeframe
        generatedEth,
        currentEthTotal: currentEthBalance,
        newEthHoldings,
        newEthGeneratedDJT
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
async function fetchInternalTransactionsEtherscan(fromAddress, toAddress) {
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  try {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'account',
        action: 'txlistinternal',
        address: toAddress,
        startblock: 0,
        endblock: 'latest',
        sort: 'asc',
        apikey: etherscanApiKey
      }
    });
    if (response.data.status === "1") {
      return response.data.result.filter(tx => tx.from.toLowerCase() === fromAddress.toLowerCase());
    } else {
      console.error('Etherscan API Error:', response.data.message);
      return [];
    }
  } catch (error) {
    console.error('Error fetching internal transactions from Etherscan:', error);
    return [];
  }
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
      const blockDifference = currentBlock - (i * blocksPerInterval);
      if (blockNumber <= blockDifference) {
        cumulativeEthGenerated[length - 1 - i] += ethValue;
      }
    }
  });
  return cumulativeEthGenerated;
}

// Generate time labels
function generateTimeLabels(days, interval) {
  const labels = [];
  const currentDate = new Date();
  for (let i = interval; i >= 0; i--) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - (days / interval) * i);
    labels.push(date.toISOString().split('T')[0]);
  }
  return labels;
}

// Generate custom time labels
function generateCustomTimeLabels(startDate, endDate, interval) {
  const labels = [];
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  for (let i = interval; i >= 0; i--) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + (totalDays / interval) * i);
    labels.push(date.toISOString().split('T')[0]);
  }
  return labels;
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

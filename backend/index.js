require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');

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

// Ethereum addresses
const trumpAddress = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce'; // Trump's doxxed ETH address
const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1'; // DJT contract address

const startingEthBalance = parseFloat(process.env.STARTING_ETH_BALANCE || '0');

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

  try {
    const currentBlock = await provider.getBlockNumber();

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

      const trumpEtherIncomeDuringTimeFrame = [];
      const etherIncomeFromContract = [];

      const supplyChange = [];
      for (let i = interval; i >= 0; i--) {
        const blockNumber = currentBlock - (i * blocksPerInterval);
        try {
          const balance = await provider.getBalance(trumpAddress, blockNumber);
          const ethBalance = parseFloat(ethers.formatUnits(balance, 'ether'));
          supplyChange.push(ethBalance);
        } catch (error) {
          console.error(`Error fetching balance for block ${blockNumber}:`, error);
          supplyChange.push(0);
        }
      }

      // Fetch internal transactions from contract address
      const contractTransactions = await fetchContractTransactionsEtherscan(contractAddress, trumpAddress);

      // Calculate cumulative ETH generated by DJT
      const cumulativeEthGeneratedByDJT = calculateCumulativeEthGeneratedByDJT(contractTransactions, supplyChange.length, currentBlock, blocksPerInterval, interval);

      // Calculate contract balance
      const contractBalance = contractTransactions.reduce((total, tx) => {
        const value = tx.value.toString();
        const integerPart = value.slice(0, -18) || '0';
        const decimalPart = value.slice(-18).padStart(18, '0');
        const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
        return total + formattedValue;
      }, 0).toFixed(4);

      // Make ETH values cumulative and adjust starting point
      const cumulativeEthAddedDuringTimeFrame = supplyChange.reduce((acc, value, index) => {
        if (index === 0) {
          acc.push(startingEthBalance); // Start with the initial balance
        } else {
          acc.push(acc[index - 1] + (value - supplyChange[index - 1]));
        }
        return acc;
      }, []);
      const cumulativeEthGeneratedByDJTFinal = cumulativeEthGeneratedByDJT.reduce((acc, value, index) => {
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
        trumpTotalEther: supplyChange[supplyChange.length - 1],
        totalEtherFromDJT: cumulativeEthGeneratedByDJTFinal
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
      simulatedData.totalEtherFromDJT = simulatedData.totalEtherFromDJT.map(value => value * 1.1); // Example simulation
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
function calculateCumulativeEthGeneratedByDJT(transactions, length, currentBlock, blocksPerInterval, interval) {
  const cumulativeEthGeneratedByDJT = new Array(length).fill(0);
  transactions.forEach(tx => {
    const value = tx.value.toString();
    const integerPart = value.slice(0, -18) || '0';
    const decimalPart = value.slice(-18).padStart(18, '0');
    const ethValue = parseFloat(`${integerPart}.${decimalPart}`);
    const blockNumber = parseInt(tx.blockNumber);

    for (let i = 0; i < length; i++) {
      const blockThreshold = currentBlock - ((interval - i) * blocksPerInterval);
      if (blockNumber <= blockThreshold) {
        cumulativeEthGeneratedByDJT[i] += ethValue;
      }
    }
  });
  return cumulativeEthGeneratedByDJT;
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

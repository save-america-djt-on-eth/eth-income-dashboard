const { ethers } = require('ethers');
const { fetchInternalTransactionsEtherscan, generateSmoothingDataPoints, calculateCumulativeEthGenerated, generateTimeLabels, generateCustomTimeLabels, calculateDeltas, generateRandomData, dateToBlockNumber } = require('./utils');

const infuraApiKey = process.env.INFURA_API_KEY;
const providerUrl = `https://mainnet.infura.io/v3/${infuraApiKey}`;
const provider = new ethers.JsonRpcProvider(providerUrl);

let cache = {
  '1d': null,
  '7d': null,
  '30d': null,
  'custom': null
};
let lastCacheUpdateTime = 0;
const cacheDuration = 1800000; // 30 minutes

const updateCache = async () => {
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
    const currentBalance = await provider.getBalance(trumpAddress);
    const currentEthBalance = parseFloat(parseFloat(ethers.formatEther(currentBalance)).toFixed(4));
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

      const supplyChange = [];
      for (let i = interval; i >= 0; i--) {
        const blockNumber = currentBlock - (i * blocksPerInterval);
        try {
          const balance = await provider.getBalance(trumpAddress, blockNumber);
          const ethBalance = parseFloat(ethers.formatEther(balance));
          supplyChange.push(ethBalance);
        } catch (error) {
          console.error(`Error fetching balance for block ${blockNumber}:`, error);
          supplyChange.push(0);
        }
      }

      // Fetch internal transactions
      const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, trumpAddress);

      // Add smoothing logic for custom time frame
      if (timeFrame === 'custom') {
        const launchDate = new Date('2024-03-21'); // Launch date
        const march23Date = new Date('2024-03-23'); // March 23 date
        const smoothingDataPoints = await generateSmoothingDataPoints(launchDate, march23Date, internalTransactions);
        internalTransactions.unshift(...smoothingDataPoints); // Add at the beginning
      }

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

      // Generate time labels
      const labels = timeFrame === 'custom' ? generateCustomTimeLabels(startDate, endDate, interval) : generateTimeLabels(days, interval);

      // Calculate deltas for supply change and cumulative ETH generated
      const supplyDelta = calculateDeltas(supplyChange);
      const djtDelta = calculateDeltas(cumulativeEthGenerated);

      // Generate random data for demonstration purposes
      const djtData = generateRandomData(labels.length);
      const nftData = generateRandomData(labels.length);
      const otherData = generateRandomData(labels.length);

      return {
        labels: labels.slice(1), // Remove the first label as we now have deltas
        djt: djtData,
        nft: nftData,
        other: otherData,
        supplyChange: supplyDelta, // Return the deltas
        cumulativeEthGenerated: djtDelta, // Return the deltas
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

const getData = (req, res) => {
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
};

const getCache = (req, res) => {
  res.json(cache);
};

module.exports = { updateCache, getData, getCache };

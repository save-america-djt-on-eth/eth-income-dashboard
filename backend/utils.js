const axios = require('axios');
const { ethers } = require('ethers');

const fetchInternalTransactionsEtherscan = async (fromAddress, toAddress) => {
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
};

const generateSmoothingDataPoints = async (launchDate, march23Date, transactions) => {
  const smoothingDataPoints = [];
  const diffInMs = march23Date - launchDate;
  const numberOfDataPoints = Math.ceil(diffInMs / (1000 * 60 * 60 * 24)); // Daily data points
  const totalValue = transactions.reduce((total, tx) => total + parseFloat(ethers.formatEther(tx.value.toString())), 0);
  const smoothingValue = totalValue / numberOfDataPoints;

  for (let i = 0; i <= numberOfDataPoints; i++) { // Include 0 to start from the initial point
    const date = new Date(launchDate.getTime() + (i * (1000 * 60 * 60 * 24)));
    const blockNumber = await dateToBlockNumber(date);
    smoothingDataPoints.push({
      value: ethers.parseUnits((smoothingValue * i).toString(), 'ether'), // Gradually increase
      blockNumber: blockNumber
    });
  }
  return smoothingDataPoints;
};

const dateToBlockNumber = async (date) => {
  const currentDate = new Date();
  const currentBlock = await provider.getBlockNumber();
  const diffInMs = currentDate - date;
  const blocksPerMs = 6500 / (24 * 60 * 60 * 1000);
  const blockNumber = currentBlock - Math.floor(diffInMs * blocksPerMs);
  return blockNumber;
};

const calculateCumulativeEthGenerated = (transactions, length, currentBlock, blocksPerInterval, interval) => {
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
};

const generateTimeLabels = (days, interval) => {
  const labels = [];
  const today = new Date();
  const msPerInterval = (days * 24 * 60 * 60 * 1000) / interval;
  for (let i = interval; i >= 0; i--) {
    const date = new Date(today.getTime() - (i * msPerInterval));
    labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
  }
  return labels;
};

const generateCustomTimeLabels = (startDate, endDate, interval) => {
  const labels = [];
  const msPerInterval = (endDate - startDate) / interval;
  for (let i = 0; i <= interval; i++) {
    const date = new Date(startDate.getTime() + (i * msPerInterval));
    labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
  }
  return labels;
};

const calculateDeltas = (data) => {
  const deltas = [];
  for (let i = 1; i < data.length; i++) {
    deltas.push(data[i - 1] + (data[i] - data[i - 1]));
  }
  return deltas;
};

const generateRandomData = (length) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 100));
};

module.exports = {
  fetchInternalTransactionsEtherscan,
  generateSmoothingDataPoints,
  dateToBlockNumber,
  calculateCumulativeEthGenerated,
  generateTimeLabels,
  generateCustomTimeLabels,
  calculateDeltas,
  generateRandomData
};

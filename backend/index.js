require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

const infuraApiKey = process.env.INFURA_API_KEY;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

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

// Function to update the cache
async function updateCache() {
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
    const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

    try {
        const currentBalance = await provider.getBalance(address);
        const currentEthBalance = parseFloat(parseFloat(ethers.formatEther(currentBalance)).toFixed(4));
        const currentBlock = await provider.getBlockNumber();
        const blocksPerDay = 6500;
        const blocksPerHour = Math.round(blocksPerDay / 24);
        const blocksPer12Hours = Math.round(blocksPerDay / 2);

        // Function to generate data for a given time frame
        async function generateData(timeFrame) {
            let days, interval, blocksPerInterval, startDate, endDate;
            if (timeFrame === '1d') {
                days = 1;
                interval = 24; // 24 hours
                blocksPerInterval = blocksPerHour;
            } else if (timeFrame === '30d') {
                days = 30;
                interval = 30; // 30 days
                blocksPerInterval = blocksPerDay;
            } else if (timeFrame === 'custom') {
                days = 0;
                interval = 30; // 30 custom intervals
                startDate = new Date('2024-03-21');
                endDate = new Date();
                blocksPerInterval = Math.floor((currentBlock - await provider.getBlockNumber(startDate)) / 30);
            } else {
                days = 7;
                interval = 14; // 7 days with 12-hour intervals
                blocksPerInterval = blocksPer12Hours;
            }

            const supplyChange = [];
            for (let i = interval; i >= 0; i--) {
                const blockNumber = currentBlock - (i * blocksPerInterval);
                try {
                    const balance = await provider.getBalance(address, blockNumber);
                    const ethBalance = parseFloat(ethers.formatEther(balance));
                    supplyChange.push(ethBalance);
                } catch (error) {
                    console.error(`Error fetching balance for block ${blockNumber}:`, error);
                    supplyChange.push(0);
                }
            }

            const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, address);

            const cumulativeEthGenerated = calculateCumulativeEthGenerated(internalTransactions, supplyChange.length, currentBlock, blocksPerInterval, interval);

            const contractBalance = internalTransactions.reduce((total, tx) => {
                const value = tx.value.toString();
                const integerPart = value.slice(0, -18) || '0';
                const decimalPart = value.slice(-18).padStart(18, '0');
                const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
                return total + formattedValue;
            }, 0).toFixed(4);

            const labels = timeFrame === 'custom' ? generateCustomTimeLabels(startDate, endDate, interval) : generateTimeLabels(days, interval);

            // Compute supplyChange delta
            const supplyDelta = [];
            for (let i = 1; i < supplyChange.length; i++) {
                supplyDelta.push(supplyChange[i] - supplyChange[i - 1]);
            }

            // Compute cumulativeEthGenerated delta
            const djtDelta = [];
            for (let i = 1; i < cumulativeEthGenerated.length; i++) {
                djtDelta.push(cumulativeEthGenerated[i] - cumulativeEthGenerated[i - 1]);
            }

            const djtData = generateRandomData(labels.length);
            const nftData = generateRandomData(labels.length);
            const otherData = generateRandomData(labels.length);

            return {
                labels: labels.slice(1),  // Remove the first label as we now have deltas
                djt: djtData,
                nft: nftData,
                other: otherData,
                supplyChange: supplyDelta,  // Return the deltas
                cumulativeEthGenerated: djtDelta,  // Return the deltas
                contractBalance,
                currentEthTotal: currentEthBalance
            };
        }

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

// Update cache every minute
setInterval(updateCache, 60000);

app.get('/api/data', (req, res) => {
    const { timeFrame } = req.query;

    if (cache[timeFrame]) {
        res.json(cache[timeFrame]);
    } else {
        res.status(400).json({ error: 'Invalid time frame' });
    }
});

async function fetchInternalTransactionsEtherscan(fromAddress, toAddress) {
    try {
        const response = await axios.get(`https://api.etherscan.io/api`, {
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

function generateCustomTimeLabels(startDate, endDate, interval) {
    const labels = [];
    const msPerInterval = (endDate - startDate) / interval;
    for (let i = 0; i <= interval; i++) {
        const date = new Date(startDate.getTime() + (i * msPerInterval));
        labels.push(date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0]);
    }
    return labels;
}

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

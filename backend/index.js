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
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
    const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

    try {
        const currentBalance = await provider.getBalance(address);
        const currentEthBalance = parseFloat(parseFloat(ethers.formatEther(currentBalance)).toFixed(4));

        const currentBlock = await provider.getBlockNumber();
        const blocksPerDay = 6500;
        const blocksPerHour = Math.round(blocksPerDay / 24);
        const blocksPer12Hours = Math.round(blocksPerDay / 2);

        let days, interval, blocksPerInterval;
        if (timeFrame === '1d') {
            days = 1;
            interval = 24; // 24 hours
            blocksPerInterval = blocksPerHour;
        } else if (timeFrame === '30d') {
            days = 30;
            interval = 30; // 30 days
            blocksPerInterval = blocksPerDay;
        } else {
            days = 7;
            interval = 14; // 7 days with 12-hour intervals
            blocksPerInterval = blocksPer12Hours;
        }

        const supplyChange = [];
        for (let i = interval; i >= 0; i--) {
            const blockNumber = currentBlock - (i * blocksPerInterval);
            const balance = await provider.getBalance(address, blockNumber);
            const ethBalance = parseFloat(ethers.formatEther(balance));
            supplyChange.push(ethBalance);
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

        const finalContractBalance = parseFloat(contractBalance);
        const labels = generateTimeLabels(days, interval);

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

        if (simulate) {
            // Simulation logic
        }

        const response = {
            labels: labels.slice(1),  // Remove the first label as we now have deltas
            djt: djtData,
            nft: nftData,
            other: otherData,
            supplyChange: supplyDelta,  // Return the deltas
            cumulativeEthGenerated: djtDelta,  // Return the deltas
            contractBalance,
            currentEthTotal: currentEthBalance
        };

        console.log('API Response:', response);

        res.json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
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

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

const infuraApiKey = process.env.INFURA_API_KEY;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
    const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

    try {
        // Get the current balance
        const currentBalance = await provider.getBalance(address);
        const ethBalance = parseFloat(ethers.formatEther(currentBalance));

        // Get the current block number
        const currentBlock = await provider.getBlockNumber();

        // Estimate the block number from 7 days ago (approximately 6500 blocks per day)
        const blocksPerDay = 6500;
        const sevenDaysAgoBlock = currentBlock - (7 * blocksPerDay);

        // Get the balance from 7 days ago
        const pastBalance = await provider.getBalance(address, sevenDaysAgoBlock);
        const pastEthBalance = parseFloat(ethers.formatEther(pastBalance));

        // Calculate the supply change over the 7 days
        const supplyChange = [ethBalance - pastEthBalance];

        // Fetch internal transactions from etherscan
        const transactions = await axios.get(`https://api.etherscan.io/api?module=account&action=txlistinternal&address=${contractAddress}&startblock=${sevenDaysAgoBlock}&endblock=${currentBlock}&sort=asc&apikey=${etherscanApiKey}`);
        
        let totalReceived = 0;
        transactions.data.result.forEach(tx => {
            if (tx.to.toLowerCase() === address.toLowerCase()) {
                totalReceived += parseFloat(ethers.formatEther(tx.value));
            }
        });

        const labels = generateTimeLabels(timeFrame);
        const djtData = generateRandomData(labels.length);
        const nftData = generateRandomData(labels.length);
        const otherData = generateRandomData(labels.length);
        const receivedData = generateReceivedData(totalReceived, labels.length);

        if (simulate) {
            // Simulation logic
        }

        const currentEthTotal = ethBalance;

        res.json({
            labels,
            djt: djtData,
            nft: nftData,
            other: otherData,
            supplyChange,
            receivedData,
            currentEthTotal
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateTimeLabels(timeFrame) {
    const labels = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        labels.push(date.toISOString().split('T')[0]);
    }
    return labels;
}

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

function generateReceivedData(totalReceived, length) {
    return Array.from({ length }, () => totalReceived / length);
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

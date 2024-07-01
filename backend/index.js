require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const infuraApiKey = process.env.INFURA_API_KEY;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

app.use(express.json());

app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';

    try {
        // Get the current block number
        const currentBlock = await provider.getBlockNumber();

        // Estimate the block number from 7 days ago (approximately 6500 blocks per day)
        const blocksPerDay = 6500;
        const days = 7;
        const labels = generateDateLabels(days);

        // Generate supply change data for each day
        const supplyChange = [];
        let previousBalance = await provider.getBalance(address, currentBlock - (blocksPerDay * (days - 1)));
        
        for (let i = days - 2; i >= 0; i--) {
            const blockNumber = currentBlock - (blocksPerDay * i);
            const balance = await provider.getBalance(address, blockNumber);
            const change = parseFloat(ethers.formatEther(balance)) - parseFloat(ethers.formatEther(previousBalance));
            supplyChange.push(change);
            previousBalance = balance;
        }

        const currentBalance = await provider.getBalance(address);
        const currentEthTotal = parseFloat(ethers.formatEther(currentBalance)).toFixed(3);

        const djtData = generateRandomData(labels.length);
        const nftData = generateRandomData(labels.length);
        const otherData = generateRandomData(labels.length);

        if (simulate) {
            // Simulation logic
        }

        res.json({
            labels,
            djt: djtData,
            nft: nftData,
            other: otherData,
            supplyChange,
            currentEthTotal
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateDateLabels(days) {
    const dates = [];
    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
}

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

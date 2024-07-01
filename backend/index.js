require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const app = express();
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

const infuraApiKey = process.env.INFURA_API_KEY;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

app.use(express.json());

app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';

    try {
        // Get the current balance
        const currentBalance = await provider.getBalance(address);
        const ethBalance = ethers.formatEther(currentBalance);

        // Get the current block number
        const currentBlock = await provider.getBlockNumber();

        // Estimate the block number from 7 days ago (approximately 6500 blocks per day)
        const blocksPerDay = 6500;
        const sevenDaysAgoBlock = currentBlock - (7 * blocksPerDay);

        // Get the balance from 7 days ago
        const pastBalance = await provider.getBalance(address, sevenDaysAgoBlock);
        const pastEthBalance = ethers.formatEther(pastBalance);

        // Calculate the supply change over the 7 days
        const supplyChange = ethBalance - pastEthBalance;

        const labels = generateTimeLabels(timeFrame);
        const djtData = generateRandomData(labels.length);
        const nftData = generateRandomData(labels.length);
        const otherData = generateRandomData(labels.length);

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
            currentEthTotal
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function generateTimeLabels(timeFrame) {
    return ['2024-06-01', '2024-06-02', '2024-06-03'];
}

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

function calculateSupplyChange(djtData, nftData, otherData) {
    return djtData.reduce((acc, val) => acc + val, 0) +
           nftData.reduce((acc, val) => acc + val, 0) +
           otherData.reduce((acc, val) => acc + val, 0);
}

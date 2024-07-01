const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Example route to fetch ETH data
app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;

    // Fetch data from Ethereum blockchain (mocked for now)
    const ethData = await fetchEthData(timeFrame, simulate === 'true');

    res.json(ethData);
});

async function fetchEthData(timeFrame, simulate) {
    // Mock data fetching logic
    const labels = generateTimeLabels(timeFrame);
    const djtData = generateRandomData(labels.length);
    const nftData = generateRandomData(labels.length);
    const otherData = generateRandomData(labels.length);

    if (simulate) {
        // Simulation logic
        // Adjust djtData based on simulation requirements
    }

    const supplyChange = calculateSupplyChange(djtData, nftData, otherData);
    const currentEthTotal = calculateCurrentEthTotal();

    return {
        labels,
        djt: djtData,
        nft: nftData,
        other: otherData,
        supplyChange,
        currentEthTotal
    };
}

function generateTimeLabels(timeFrame) {
    // Generate time labels based on time frame (mocked for now)
    return ['2024-06-01', '2024-06-02', '2024-06-03'];
}

function generateRandomData(length) {
    // Generate random data (mocked for now)
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

function calculateSupplyChange(djtData, nftData, otherData) {
    // Calculate supply change (mocked for now)
    return djtData.reduce((acc, val) => acc + val, 0) +
           nftData.reduce((acc, val) => acc + val, 0) +
           otherData.reduce((acc, val) => acc + val, 0);
}

function calculateCurrentEthTotal() {
    // Calculate current ETH total (mocked for now)
    return Math.floor(Math.random() * 1000000);
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


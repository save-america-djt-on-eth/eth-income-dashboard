require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

const infuraApiKey = process.env.INFURA_API_KEY;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

app.use(express.json());

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
        const supplyChange = [];
        for (let i = 0; i <= 7; i++) {
            const blockNumber = currentBlock - (i * blocksPerDay);
            const balance = await provider.getBalance(address, blockNumber);
            const ethBalance = parseFloat(ethers.formatEther(balance));
            if (i > 0) {
                supplyChange.push(ethBalance - supplyChange[supplyChange.length - 1]);
            } else {
                supplyChange.push(ethBalance);
            }
        }

        // Fetch internal transactions from the contract address to the given address
        const internalTransactions = await fetchInternalTransactions(provider, contractAddress, address, sevenDaysAgoBlock, currentBlock);
        const contractBalance = internalTransactions.reduce((total, tx) => total + parseFloat(ethers.formatEther(tx.value || '0')), 0);

        const labels = generateTimeLabels(timeFrame);
        const djtData = generateRandomData(labels.length);
        const nftData = generateRandomData(labels.length);
        const otherData = generateRandomData(labels.length);

        if (simulate) {
            // Simulation logic
        }

        const response = {
            labels,
            djt: djtData,
            nft: nftData,
            other: otherData,
            supplyChange,
            contractBalance,
            currentEthTotal: ethBalance
        };

        console.log('API Response:', response); // Log the response

        res.json(response);
    } catch (error) {
        console.error('Error:', error); // Log the error
        res.status(500).json({ error: error.message });
    }
});

async function fetchInternalTransactions(provider, fromAddress, toAddress, startBlock, endBlock) {
    const logs = await provider.getLogs({
        fromBlock: startBlock,
        toBlock: endBlock,
        address: fromAddress,
        topics: [
            ethers.utils.id("Transfer(address,address,uint256)"),
            null,
            ethers.utils.hexZeroPad(toAddress, 32)
        ]
    });

    const transactions = await Promise.all(logs.map(async log => {
        const tx = await provider.getTransaction(log.transactionHash);
        if (tx && tx.value) {
            return tx;
        }
        return null;
    }));

    return transactions.filter(tx => tx !== null); // Ensure to filter out null transactions
}

function generateTimeLabels(timeFrame) {
    const labels = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        labels.push(date.toISOString().split('T')[0]);
    }
    return labels;
}

function generateRandomData(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
}

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

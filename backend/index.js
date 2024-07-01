require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Add axios for API calls
const { ethers } = require('ethers');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

const infuraApiKey = process.env.INFURA_API_KEY;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY; // Add Etherscan API key
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`);

app.use(express.json());

app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
    const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

    try {
        // Get the current balance
        const currentBalance = await provider.getBalance(address);
        const ethBalance = parseFloat(ethers.formatEther(currentBalance)).toFixed(4);

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

        // Fetch internal transactions from the contract address to the given address using Etherscan API
        const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, address);
        const contractBalance = internalTransactions.reduce((total, tx) => {
            const value = tx.value.toString(); // Ensure value is a string
            const integerPart = value.slice(0, -18) || '0'; // Get the integer part, default to '0' if empty
            const decimalPart = value.slice(-18).padStart(18, '0'); // Get the decimal part, pad with zeros if necessary
            const formattedValue = parseFloat(`${integerPart}.${decimalPart}`); // Combine parts and convert to float
            return total + formattedValue;
        }, 0).toFixed(4); // Limit to three decimal places
        
        // Convert contractBalance to a float for further processing
        const finalContractBalance = parseFloat(contractBalance);
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

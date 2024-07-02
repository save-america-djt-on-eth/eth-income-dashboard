app.get('/api/data', async (req, res) => {
    const { timeFrame, simulate } = req.query;
    const address = '0x94845333028B1204Fbe14E1278Fd4Adde46B22ce';
    const contractAddress = '0xE68F1cb52659f256Fee05Fd088D588908A6e85A1';

    try {
        const currentBalance = await provider.getBalance(address);
        const currentEthBalance = parseFloat(parseFloat(ethers.formatEther(currentBalance)).toFixed(4));

        const currentBlock = await provider.getBlockNumber();
        const blocksPerDay = 6500;

        let days;
        if (timeFrame === '1d') {
            days = 1;
        } else if (timeFrame === '30d') {
            days = 30;
        } else {
            days = 7;
        }

        const supplyChange = [];
        for (let i = days; i >= 0; i--) {
            const blockNumber = currentBlock - (i * blocksPerDay);
            const balance = await provider.getBalance(address, blockNumber);
            const ethBalance = parseFloat(ethers.formatEther(balance));
            supplyChange.push(ethBalance);
        }

        const internalTransactions = await fetchInternalTransactionsEtherscan(contractAddress, address);

        const cumulativeEthGenerated = calculateCumulativeEthGenerated(internalTransactions, supplyChange.length, currentBlock, blocksPerDay);

        const contractBalance = internalTransactions.reduce((total, tx) => {
            const value = tx.value.toString();
            const integerPart = value.slice(0, -18) || '0';
            const decimalPart = value.slice(-18).padStart(18, '0');
            const formattedValue = parseFloat(`${integerPart}.${decimalPart}`);
            return total + formattedValue;
        }, 0).toFixed(4);

        const finalContractBalance = parseFloat(contractBalance);
        const labels = generateTimeLabels(days);

        // Compute daily supplyChange delta
        const dailySupplyDelta = [];
        for (let i = 1; i < supplyChange.length; i++) {
            dailySupplyDelta.push(supplyChange[i] - supplyChange[i - 1]);
        }
		// Compute daily cumulativeEthGenerated delta
        const dailyDJTDelta = [];
        for (let i = 1; i < cumulativeEthGenerated.length; i++) {
            dailyDJTDelta.push(cumulativeEthGenerated[i] - cumulativeEthGenerated[i - 1]);
        }

        const djtData = generateRandomData(labels.length);
        const nftData = generateRandomData(labels.length);
        const otherData = generateRandomData(labels.length);

        if (simulate) {
            // Simulation logic
        }

        const response = {
            labels: labels.slice(1),  // Remove the first label as we now have 7 deltas
            djt: djtData,
            nft: nftData,
            other: otherData,
            supplyChange: dailySupplyDelta,  // Return the daily deltas
            cumulativeEthGenerated: dailyDJTDelta,  // Return the daily deltas
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

function generateTimeLabels(days) {
    const labels = [];
    const today = new Date();
    for (let i = days; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        labels.push(date.toISOString().split('T')[0]);
    }
    return labels;
}

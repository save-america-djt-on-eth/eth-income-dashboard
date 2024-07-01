document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('http://5.161.44.208:3000/api/data?timeFrame=7d&simulate=false');
        const data = await response.json();
        createChart(data);
        displayTotalEthSupply(data.currentEthTotal);
    } catch (error) {
        console.error('Error fetching data: ', error);
    }
});

function createChart(data) {
    const ctx = document.getElementById('supplyChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Supply Change Over Time',
                    data: data.supplyChange,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    fill: false
                },
                {
                    label: 'Contract Transactions Over Time',
                    data: data.contractBalance,
                    borderColor: 'rgba(192, 75, 192, 1)',
                    borderWidth: 1,
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function displayTotalEthSupply(totalEth) {
    document.getElementById('totalEthSupply').innerText = `Total ETH Supply: ${totalEth.toFixed(3)}`;
}

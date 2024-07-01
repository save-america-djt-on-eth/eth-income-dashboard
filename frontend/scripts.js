document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Fetch data from the backend
        const response = await fetch('http://5.161.44.208:3000/api/data?timeFrame=7d&simulate=false');
        const data = await response.json();

        // Update total ETH supply
        document.getElementById('totalEthSupply').textContent = `${data.currentEthTotal} ETH`;

        // Create the supply chart
        const ctx = document.getElementById('supplyChart').getContext('2d');
        const supplyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Supply Change',
                    data: data.djt, // Assuming djtData represents the supply change over time
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Supply Change (ETH)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching data:', error);
    }
});

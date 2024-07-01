document.addEventListener("DOMContentLoaded", function () {
    fetch("http://5.161.44.208:3000/api/data?timeFrame=7d&simulate=false")
        .then(response => response.json())
        .then(data => {
            console.log("API Data: ", data);
            // Reverse the data arrays for correct chronological order
            const reversedLabels = data.labels.reverse();
            const reversedSupplyChange = data.supplyChange.reverse();
            const reversedContractBalance = new Array(reversedLabels.length).fill(data.contractBalance);

            // Update the chart
            updateChart(reversedLabels, reversedSupplyChange, reversedContractBalance);

            // Update the ETH values
            document.getElementById("total-eth").innerText = data.currentEthTotal.toFixed(4);
            document.getElementById("eth-generated-djt").innerText = data.contractBalance.toFixed(4);
            const percentage = ((data.contractBalance / data.currentEthTotal) * 100).toFixed(0);
            document.getElementById("eth-percentage-value").innerText = `${percentage}%`;
        })
        .catch(error => console.error("Error fetching data: ", error));
});

function updateChart(labels, supplyChange, contractBalance) {
    const ctx = document.getElementById('myChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Supply Change Over Time',
                    data: supplyChange,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: false
                },
                {
                    label: 'Contract Balance Over Time',
                    data: contractBalance,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        tooltipFormat: 'MM/dd/yyyy',
                        displayFormats: {
                            day: 'MM/dd/yyyy'
                        }
                    },
                    adapters: {
                        date: {
                            locale: window.dateFnsLocale // Ensure the locale is correctly referenced
                        }
                    }
                }
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    fetchData('7d'); // Default time frame

    // Add event listeners to buttons
    document.getElementById('btn-1d').addEventListener('click', () => fetchData('1d'));
    document.getElementById('btn-7d').addEventListener('click', () => fetchData('7d'));
    document.getElementById('btn-30d').addEventListener('click', () => fetchData('30d'));
    document.getElementById('btn-custom').addEventListener('click', () => fetchData('custom'));
});

function fetchData(timeFrame) {
    const buttons = document.querySelectorAll("#time-frame-buttons button");
    buttons.forEach(button => button.classList.remove("active"));

    const activeButton = Array.from(buttons).find(button => button.textContent.toLowerCase() === timeFrame.toLowerCase() || button.innerHTML.includes("greyscale-djt.ico"));
    if (activeButton) {
        activeButton.classList.add("active");
    }

    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const apiUrl = `${protocol}//${hostname}${port}/api/data?timeFrame=${timeFrame}&simulate=false`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error(`API Data: ${data.error}`);
                return;
            }
            console.log("API Data: ", data);
            updateChart(data.labels, data.supplyChange, data.cumulativeEthGenerated, timeFrame);
            document.getElementById("total-eth").innerText = Number(data.currentEthTotal).toFixed(4);
            document.getElementById("eth-generated-djt").innerText = Number(data.contractBalance).toFixed(4);
            const percentage = ((data.contractBalance / data.currentEthTotal) * 100).toFixed(0);
            document.getElementById("eth-percentage-value").innerText = `${percentage}%`;
        })
        .catch(error => console.error("Error fetching data: ", error));
}

function updateChart(labels, trumpEtherIncomeDuringTimeFrame, etherIncomeFromContract, timeFrame) {
    const titleText = timeFrame === 'custom' ? 'Since $DJT Launch' : '';

    Highcharts.chart('myChart', {
        chart: {
            type: 'line',
            backgroundColor: '#121212',
            style: {
                fontFamily: '\'Unica One\', sans-serif'
            },
            plotBorderColor: '#606063'
        },
        title: {
            text: titleText,
            style: {
                color: '#E0E0E3',
                textTransform: 'uppercase',
                fontSize: '20px'
            }
        },
        xAxis: {
            categories: labels,
            gridLineColor: '#333333',
            labels: {
                style: {
                    color: '#AAAAAA'
                }
            },
            lineColor: '#707073',
            minorGridLineColor: '#505053',
            tickColor: '#707073',
            title: {
                style: {
                    color: '#A0A0A3'
                }
            }
        },
        yAxis: {
            gridLineColor: '#333333',
            labels: {
                style: {
                    color: '#AAAAAA'
                }
            },
            lineColor: '#707073',
            minorGridLineColor: '#505053',
            tickColor: '#707073',
            tickWidth: 1,
            title: {
                text: '',
                style: {
                    color: '#A0A0A3'
                }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            style: {
                color: '#F0F0F0'
            }
        },
        plotOptions: {
            series: {
                dataLabels: {
                    color: '#B0B0B3'
                },
                marker: {
                    lineColor: '#333'
                },
                showInLegend: true
            },
            line: {
                lineWidth: 2,
                marker: {
                    enabled: true,
                    radius: 3
                },
                states: {
                    hover: {
                        lineWidth: 3
                    }
                },
                threshold: null
            }
        },
        series: [{
            name: 'Total ETH Added (Excluding DJT)',
            data: trumpEtherIncomeDuringTimeFrame,
            color: '#29ABE2',
            visible: false // Hide by default
        }, {
            name: '$DJT Generated ETH',
            data: etherIncomeFromContract,
            color: '#F15A24'
        }],
        legend: {
            itemStyle: {
                color: '#E0E0E3'
            },
            itemHoverStyle: {
                color: '#FFF'
            },
            itemHiddenStyle: {
                color: '#606063'
            }
        },
        credits: {
            enabled: false
        },
        labels: {
            style: {
                color: '#707073'
            }
        },
        navigation: {
            buttonOptions: {
                symbolStroke: '#DDDDDD',
                theme: {
                    fill: '#505053'
                }
            }
        },
        rangeSelector: {
            buttonTheme: {
                fill: '#505053',
                stroke: '#000000',
                style: {
                    color: '#CCC'
                },
                states: {
                    hover: {
                        fill: '#707073',
                        stroke: '#000000',
                        style: {
                            color: 'white'
                        }
                    },
                    select: {
                        fill: '#000003',
                        stroke: '#000000',
                        style: {
                            color: 'white'
                        }
                    }
                }
            },
            inputBoxBorderColor: '#505053',
            inputStyle: {
                backgroundColor: '#333',
                color: 'silver'
            },
            labelStyle: {
                color: 'silver'
            }
        },
        navigator: {
            handles: {
                backgroundColor: '#666',
                borderColor: '#AAA'
            },
            outlineColor: '#CCC',
            maskFill: 'rgba(255,255,255,0.1)',
            series: {
                color: '#7798BF',
                lineColor: '#A6C7ED'
            },
            xAxis: {
                gridLineColor: '#505053'
            }
        },
        scrollbar: {
            barBackgroundColor: '#808083',
            barBorderColor: '#808083',
            buttonArrowColor: '#CCC',
            buttonBackgroundColor: '#606063',
            buttonBorderColor: '#606063',
            rifleColor: '#FFF',
            trackBackgroundColor: '#404043',
            trackBorderColor: '#404043'
        }
    });
}

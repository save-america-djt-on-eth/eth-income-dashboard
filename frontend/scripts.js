// Function to generate data for a given time frame
async function generateData(timeFrame) {
    let days, interval, blocksPerInterval, startDate, endDate;
    if (timeFrame === '1d') {
        days = 1;
        interval = 24; // 24 hours
        blocksPerInterval = blocksPerHour;
    } else if (timeFrame === '30d') {
        days = 30;
        interval = 30; // 30 days
        blocksPerInterval = blocksPerDay;
    } else if (timeFrame === 'custom') {
        startDate = new Date('2024-03-20'); // Start date
        endDate = new Date(); // Current date
        const msInDay = 24 * 60

// Main JavaScript for Stock Market Analysis Application

// Global variables
let chart;
let candleSeries;
let volumeSeries;
let lineSeries;
let maSeries;
let predictionSeries;
let currentTicker = 'RELIANCE.NS';
let chartType = 'candle';
let lookbackDays = 7;
let interval = '5m';
let stockData = [];
let predictionData = [];

// Utility: Debounce function for search input
function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    };
}

// DOM elements
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const tickerName = document.getElementById('ticker-name');
const tickerPrice = document.getElementById('ticker-price');
const tickerChange = document.getElementById('ticker-change');
const lastUpdated = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const chartElement = document.getElementById('chart');

// Technical indicator toggles
const toggleMA = document.getElementById('toggle-ma');
const maPeriod = document.getElementById('ma-period');
const togglePrediction = document.getElementById('toggle-prediction');
const toggleVolume = document.getElementById('toggle-volume');

// Stock info elements
const infoOpen = document.getElementById('info-open');
const infoHigh = document.getElementById('info-high');
const infoLow = document.getElementById('info-low');
const infoClose = document.getElementById('info-close');
const infoVolume = document.getElementById('info-volume');
const infoPrediction = document.getElementById('info-prediction');

// Initialize the chart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeChart();
    loadStockData(currentTicker, lookbackDays, interval);
    setupEventListeners();
    
    // Set initial ticker name
    tickerName.textContent = currentTicker;
});

// Initialize the TradingView Lightweight Chart
function initializeChart() {
    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.clientWidth,
        height: chartElement.clientHeight,
        layout: {
            backgroundColor: '#131722',
            textColor: '#d9d9d9',
        },
        grid: {
            vertLines: {
                color: '#363c4e',
            },
            horzLines: {
                color: '#363c4e',
            },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#485c7b',
        },
        timeScale: {
            borderColor: '#485c7b',
        },
    });

    // Create candlestick series
    candleSeries = chart.addCandlestickSeries({
        upColor: '#4caf50',
        downColor: '#f44336',
        borderDownColor: '#f44336',
        borderUpColor: '#4caf50',
        wickDownColor: '#f44336',
        wickUpColor: '#4caf50',
    });

    // Add volume series
    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
            type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
            top: 0.8,
            bottom: 0,
        },
    });

    // Add moving average series
    maSeries = chart.addLineSeries({
        color: '#f48fb1',
        lineWidth: 2,
        priceLineVisible: false,
    });

    // Add prediction series
    predictionSeries = chart.addLineSeries({
        color: '#ff9800',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        lastValueVisible: false,
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (chart) {
            chart.applyOptions({
                width: chartElement.clientWidth,
                height: chartElement.clientHeight,
            });
        }
    });
}

// Load stock data from the API
function loadStockData(ticker, days, timeInterval) {
    // Show loading state
    tickerPrice.textContent = "Loading...";
    tickerChange.textContent = "";
    lastUpdated.textContent = "Loading data...";
    
    // Fetch data from backend API
    fetch(`/api/stock-data?ticker=${ticker}&lookback=${days}&interval=${timeInterval}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Store data
            stockData = data.data;
            predictionData = data.predictions;
            
            // Update chart
            updateChart();
            
            // Update stock info panel
            updateStockInfo();
            
            // Update last updated time
            lastUpdated.textContent = `Last updated: ${data.last_updated}`;
            
            // Update ticker info
            updateTickerInfo();
        })
        .catch(error => {
            console.error('Error fetching stock data:', error);
            alert(`Error loading data: ${error.message}`);
        });
}

// Update the chart with new data
function updateChart() {
    // Prepare data for chart
    const ohlcData = stockData.map(item => ({
        time: new Date(item.timestamp).getTime() / 1000,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close
    }));
    
    const volumeData = stockData.map(item => ({
        time: new Date(item.timestamp).getTime() / 1000,
        value: item.volume,
        color: item.close > item.open ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'
    }));
    
    // Set data
    candleSeries.setData(ohlcData);
    volumeSeries.setData(volumeData);
    
    // Calculate and set MA data
    updateIndicators();
    
    // Set prediction data
    if (predictionData && predictionData.length > 0) {
        const predData = predictionData.map(item => ({
            time: new Date(item.timestamp).getTime() / 1000,
            value: item.price
        }));
        
        // Add last point from actual data to connect the lines
        if (stockData.length > 0) {
            predData.unshift({
                time: new Date(stockData[stockData.length - 1].timestamp).getTime() / 1000,
                value: stockData[stockData.length - 1].close
            });
        }
        
        predictionSeries.setData(predData);
    }
    
    // Fit content
    chart.timeScale().fitContent();
}

// Update indicators based on user selection
function updateIndicators() {
    // Moving Average
    if (toggleMA.checked) {
        const period = parseInt(maPeriod.value);
        const maData = calculateMA(stockData, period);
        maSeries.setData(maData);
        maSeries.applyOptions({ visible: true });
    } else {
        maSeries.applyOptions({ visible: false });
    }
    
    // Prediction line
    predictionSeries.applyOptions({ visible: togglePrediction.checked });
    
    // Volume
    volumeSeries.applyOptions({ visible: toggleVolume.checked });
}

// Calculate Moving Average
function calculateMA(data, period) {
    const result = [];
    
    // Need at least 'period' data points
    if (data.length < period) return result;
    
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        result.push({
            time: new Date(data[i].timestamp).getTime() / 1000,
            value: sum / period
        });
    }
    
    return result;
}

// Update chart type (candle, line, bar)
function updateChartType() {
    // Remove existing series
    chart.removeSeries(candleSeries);
    
    // Create new series based on chart type
    if (chartType === 'candle') {
        candleSeries = chart.addCandlestickSeries({
            upColor: '#4caf50',
            downColor: '#f44336',
            borderDownColor: '#f44336',
            borderUpColor: '#4caf50',
            wickDownColor: '#f44336',
            wickUpColor: '#4caf50',
        });
    } else if (chartType === 'line') {
        candleSeries = chart.addLineSeries({
            color: '#2962ff',
            lineWidth: 2,
        });
    } else if (chartType === 'bar') {
        candleSeries = chart.addBarSeries({
            upColor: '#4caf50',
            downColor: '#f44336',
        });
    }
    
    // Update data
    const ohlcData = stockData.map(item => ({
        time: new Date(item.timestamp).getTime() / 1000,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        value: item.close // For line chart
    }));
    
    candleSeries.setData(ohlcData);
}

// Update stock information panel
function updateStockInfo() {
    if (stockData.length > 0) {
        const latestData = stockData[stockData.length - 1];
        infoOpen.textContent = latestData.open.toFixed(2);
        infoHigh.textContent = latestData.high.toFixed(2);
        infoLow.textContent = latestData.low.toFixed(2);
        infoClose.textContent = latestData.close.toFixed(2);
        infoVolume.textContent = formatNumber(latestData.volume);
        
        if (predictionData && predictionData.length > 0) {
            const latestPrediction = predictionData[predictionData.length - 1];
            infoPrediction.textContent = latestPrediction.price.toFixed(2);
        }
    }
}

// Update ticker info (price, change)
function updateTickerInfo() {
    if (stockData.length > 0) {
        const latestData = stockData[stockData.length - 1];
        tickerPrice.textContent = `₹${latestData.close.toFixed(2)}`;
        
        // Calculate change from previous day's close
        if (stockData.length > 1) {
            const previousClose = stockData[stockData.length - 2].close;
            const change = latestData.close - previousClose;
            const changePercent = (change / previousClose) * 100;
            
            tickerChange.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
            tickerChange.className = 'change ' + (change >= 0 ? 'positive' : 'negative');
        }
    }
}

// Format large numbers with commas
function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

// Handle search input
function handleSearch() {
    const query = searchInput.value.trim();
    
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }
    
    // Fetch search results from API
    fetch(`/api/search-ticker?query=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                displaySearchResults(data.results);
            } else {
                searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
                searchResults.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error searching tickers:', error);
        });
}

// Display search results
function displaySearchResults(results) {
    searchResults.innerHTML = '';
    
    results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        resultItem.innerHTML = `<span class="result-symbol">${result.symbol}</span><span class="result-name">${result.name}</span>`;
        
        resultItem.addEventListener('click', () => {
            currentTicker = result.symbol;
            tickerName.textContent = `${result.name} (${result.symbol})`;
            searchInput.value = result.symbol;
            searchResults.style.display = 'none';
            loadStockData(currentTicker, lookbackDays, interval);
        });
        
        searchResults.appendChild(resultItem);
    });
    
    searchResults.style.display = 'block';
}

// Setup event listeners for UI elements
function setupEventListeners() {
    // Search functionality
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    searchButton.addEventListener('click', () => handleSearch());
    
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadStockData(currentTicker, lookbackDays, interval);
    });
    
    // Timeframe selector
    const timeframeButtons = document.querySelectorAll('.timeframe-btn');
    timeframeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            timeframeButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            lookbackDays = parseInt(e.target.getAttribute('data-days'));
            interval = e.target.getAttribute('data-interval');
            loadStockData(currentTicker, lookbackDays, interval);
        });
    });
    
    // Chart type selector
    const chartTypeButtons = document.querySelectorAll('.chart-type-btn');
    chartTypeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            chartTypeButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            chartType = e.target.getAttribute('data-type');
            updateChartType();
        });
    });
    
    // Indicator toggles
    toggleMA.addEventListener('change', updateIndicators);
    maPeriod.addEventListener('change', updateIndicators);
    togglePrediction.addEventListener('change', updateIndicators);
    toggleVolume.addEventListener('change', updateIndicators);
}
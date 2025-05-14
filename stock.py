import yfinance as yf
import datetime
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import mplfinance as mpf
import time
from sklearn.linear_model import LinearRegression

# Configuration
REFRESH_INTERVAL = 60  # seconds
LOOKBACK_DAYS = 7
PREDICTION_WINDOW = 10  # minutes
DEFAULT_INR_RATE = 83.0

# Cache for USD-INR rate
USD_INR_CACHE = None

# Cache for stock data
stock_data_cache = {}

def get_usd_to_inr():
    global USD_INR_CACHE
    if USD_INR_CACHE is None:
        try:
            inr_data = yf.Ticker("USDINR=X")
            USD_INR_CACHE = inr_data.history(period="1d")['Close'].iloc[-1]
            print(f"Current USD to INR: {USD_INR_CACHE}")
        except Exception as e:
            print(f"Failed to fetch USD-INR rate: {e}, using default {DEFAULT_INR_RATE}")
            USD_INR_CACHE = DEFAULT_INR_RATE
    return USD_INR_CACHE

def get_valid_ticker():
    while True:
        ticker = input("Enter Stock Symbol (e.g., TCS.NS, RELIANCE.NS, AAPL): ").strip().upper()
        if ticker:
            return ticker
        print("Please enter a valid stock symbol")

def process_data(live_data, ticker):
    """Process and clean the downloaded data"""
    if isinstance(live_data.columns, pd.MultiIndex):
        live_data.columns = live_data.columns.droplevel(1)
    
    numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    for col in numeric_cols:
        if col in live_data.columns:
            live_data[col] = pd.to_numeric(live_data[col], errors='coerce')
    
    live_data = live_data.dropna()
    
    if len(live_data) < 10:
        print("Warning: Very little data received - market may be closed")
        return None
    
    if not (".NS" in ticker or ".BO" in ticker):
        conversion_rate = get_usd_to_inr()
        for col in ['Open', 'High', 'Low', 'Close']:
            if col in live_data.columns:
                live_data[col] = live_data[col] * conversion_rate
    
    return live_data

def create_plots(live_data, ticker):
    """Create all visualizations"""
    plt.style.use('dark_background')
    
    # Main price plot
    fig, ax = plt.subplots(figsize=(14, 7))
    
    # Plot main price data
    ax.plot(live_data.index, live_data['Close'], label='Close Price', color='blue', linewidth=2)
    ax.plot(live_data.index, live_data['High'], label='High', color='green', alpha=0.5)
    ax.plot(live_data.index, live_data['Low'], label='Low', color='red', alpha=0.5)
    
    live_data['MA5'] = live_data['Close'].rolling(5).mean()
    ax.plot(live_data.index, live_data['MA5'], label='5-min MA', color='purple')
    
    x = np.arange(len(live_data)).reshape(-1, 1)
    y = live_data['Close'].values
    model = LinearRegression().fit(x, y)
    
    ax.plot(live_data.index, model.predict(x), label='Trend', color='orange', linestyle='--')
    
    future_x = np.arange(len(live_data), len(live_data) + PREDICTION_WINDOW).reshape(-1, 1)
    future_prices = model.predict(future_x)
    future_times = [live_data.index[-1] + datetime.timedelta(minutes=i) for i in range(1, PREDICTION_WINDOW+1)]
    ax.plot(future_times, future_prices, 'ro-', label=f'Next {PREDICTION_WINDOW}min Prediction')
    
    ax.set_title(f"{ticker} Stock Price (INR)", pad=20, fontsize=16)
    ax.set_xlabel("Time", labelpad=10)
    ax.set_ylabel("Price (INR)", labelpad=10)
    ax.legend(loc='upper left')
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    plt.show()
    
    mpf.plot(live_data, type='candle', style='charles', 
             title=f"{ticker} Candlestick", 
             volume=True,
             figsize=(14, 7),
             show_nontrading=True)

def fetch_and_plot(ticker):
    # Check if the data is already cached
    if ticker in stock_data_cache and time.time() - stock_data_cache[ticker]['timestamp'] < REFRESH_INTERVAL:
        print(f"Using cached data for {ticker}...")
        live_data = stock_data_cache[ticker]['data']
    else:
        try:
            today = datetime.datetime.today().strftime('%Y-%m-%d')
            start_date = (datetime.datetime.today() - datetime.timedelta(days=LOOKBACK_DAYS)).strftime('%Y-%m-%d')
            
            print(f"\nFetching data for {ticker} from {start_date} to {today}...")
            live_data = yf.download(ticker, start=start_date, end=today, interval='1m')
            
            if live_data.empty:
                print("No data found! Try a different symbol or check your internet connection.")
                return False
            
            processed_data = process_data(live_data, ticker)
            if processed_data is None:
                return False
            
            # Cache the data with a timestamp
            stock_data_cache[ticker] = {'data': processed_data, 'timestamp': time.time()}
            print("\nLatest data points:")
            print(processed_data.tail(3))
            
            create_plots(processed_data, ticker)
            return True
        
        except Exception as e:
            print(f"\nError during processing: {str(e)}")
            return False

def main():
    print("Stock Market Live Visualization")
    print("-----------------------------")
    
    ticker = get_valid_ticker()
    successful_runs = 0
    
    try:
        while True:
            success = fetch_and_plot(ticker)
            if success:
                successful_runs += 1
                print(f"\nUpdate #{successful_runs} completed at {datetime.datetime.now().strftime('%H:%M:%S')}")
            print(f"\nNext update in {REFRESH_INTERVAL} seconds... (Press Ctrl+C to stop)")
            time.sleep(REFRESH_INTERVAL)
    except KeyboardInterrupt:
        print("\nProgram stopped by user. Goodbye!")

if __name__ == "__main__":
    main()

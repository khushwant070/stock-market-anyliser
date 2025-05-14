"""
Flask backend for Stock Market Analysis Application
"""
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import yfinance as yf
import datetime
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
import os

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable cross-origin requests for API access

# Configuration
LOOKBACK_DAYS = 7
PREDICTION_WINDOW = 10  # minutes
DEFAULT_INR_RATE = 83.0

# Cache for USD-INR rate and stock data
USD_INR_CACHE = None
stock_data_cache = {}

def get_usd_to_inr():
    """Fetch and cache USD to INR conversion rate"""
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

def process_data(live_data, ticker):
    """Process and clean the downloaded stock data"""
    if isinstance(live_data.columns, pd.MultiIndex):
        live_data.columns = live_data.columns.droplevel(1)
    
    numeric_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
    for col in numeric_cols:
        if col in live_data.columns:
            live_data[col] = pd.to_numeric(live_data[col], errors='coerce')
    
    live_data = live_data.dropna()
    
    if len(live_data) < 5:
        print("Warning: Very little data received - market may be closed")
        return None
    
    # Convert to INR if not an Indian stock
    if not (".NS" in ticker or ".BO" in ticker):
        conversion_rate = get_usd_to_inr()
        for col in ['Open', 'High', 'Low', 'Close']:
            if col in live_data.columns:
                live_data[col] = live_data[col] * conversion_rate
    
    return live_data

def generate_predictions(data):
    """Generate trend prediction using Linear Regression"""
    if len(data) < 5:
        return []
    
    df = data.copy()
    
    # Calculate moving averages
    df['MA5'] = df['Close'].rolling(5).mean()
    df['MA20'] = df['Close'].rolling(20).mean()
    
    # Linear regression for prediction
    x = np.arange(len(df)).reshape(-1, 1)
    y = df['Close'].values
    model = LinearRegression().fit(x, y)
    
    # Predict future prices
    future_x = np.arange(len(df), len(df) + PREDICTION_WINDOW).reshape(-1, 1)
    future_prices = model.predict(future_x)
    
    # Create future timestamps
    last_timestamp = df.index[-1]
    future_times = [last_timestamp + datetime.timedelta(minutes=i+1) for i in range(PREDICTION_WINDOW)]
    
    # Prepare prediction data
    predictions = []
    for i, (time, price) in enumerate(zip(future_times, future_prices)):
        predictions.append({
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'price': float(price)
        })
    
    return predictions

def prepare_stock_data_for_json(data):
    """Convert pandas DataFrame to JSON-friendly format for charts"""
    result = []
    for idx, row in data.iterrows():
        result.append({
            'timestamp': idx.strftime('%Y-%m-%d %H:%M:%S'),
            'open': float(row['Open']),
            'high': float(row['High']),
            'low': float(row['Low']),
            'close': float(row['Close']),
            'volume': int(row['Volume']) if 'Volume' in row and not np.isnan(row['Volume']) else 0
        })
    return result

# API Routes
@app.route('/')
def index():
    """Serve the main application page"""
    return render_template('index.html')

@app.route('/api/stock-data', methods=['GET'])
def get_stock_data():
    """API endpoint to fetch stock data"""
    ticker = request.args.get('ticker', 'RELIANCE.NS')
    lookback = int(request.args.get('lookback', LOOKBACK_DAYS))
    interval = request.args.get('interval', '1m')
    
    try:
        # Calculate date range
        today = datetime.datetime.today().strftime('%Y-%m-%d')
        start_date = (datetime.datetime.today() - datetime.timedelta(days=lookback)).strftime('%Y-%m-%d')
        
        # Fetch data from Yahoo Finance
        stock_data = yf.download(ticker, start=start_date, end=today, interval=interval)
        
        if stock_data.empty:
            return jsonify({'error': 'No data found for this ticker symbol'}), 404
        
        # Process data
        processed_data = process_data(stock_data, ticker)
        if processed_data is None:
            return jsonify({'error': 'Insufficient data available'}), 400
        
        # Generate predictions
        predictions = generate_predictions(processed_data)
        
        # Format data for JSON response
        json_data = prepare_stock_data_for_json(processed_data)
        
        # Prepare response
        response = {
            'ticker': ticker,
            'data': json_data,
            'predictions': predictions,
            'last_updated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/search-ticker', methods=['GET'])
def search_ticker():
    """API endpoint to search for available tickers"""
    query = request.args.get('query', '').upper()
    
    if not query or len(query) < 2:
        return jsonify({'results': []})
    
    # This is a simplified version - in a real app, you'd search against a database
    # of available tickers or use an API that provides ticker search
    common_indian_tickers = [
        {"symbol": "RELIANCE.NS", "name": "Reliance Industries Ltd"},
        {"symbol": "TCS.NS", "name": "Tata Consultancy Services Ltd"},
        {"symbol": "INFY.NS", "name": "Infosys Ltd"},
        {"symbol": "HDFCBANK.NS", "name": "HDFC Bank Ltd"},
        {"symbol": "ICICIBANK.NS", "name": "ICICI Bank Ltd"},
        {"symbol": "WIPRO.NS", "name": "Wipro Ltd"},
        {"symbol": "AAPL", "name": "Apple Inc (USD)"},
        {"symbol": "MSFT", "name": "Microsoft Corporation (USD)"},
        {"symbol": "GOOGL", "name": "Alphabet Inc (USD)"},
        {"symbol": "AMZN", "name": "Amazon.com Inc (USD)"}
    ]
    
    results = [item for item in common_indian_tickers if query in item["symbol"] or query in item["name"].upper()]
    return jsonify({'results': results})

if __name__ == '__main__':
    app.run(debug=True)
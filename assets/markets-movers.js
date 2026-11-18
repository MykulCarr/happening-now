// Markets page: the Gainers, Losers and Trending cards and the economic
// calendar. Split out of stocks.js on 2026-11-17; loaded just before it.
// Note: the small chart beside each mover is drawn from generateMockPrice,
// i.e. made-up numbers, not a real price history (raised with Mike 2026-11-17).
(() => {
  "use strict";
  const S = (window.App.marketsPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const { escapeHtml, fetchStockGainers, fetchStockLosers, fetchStockMovers } = window.App;
  const parseMoverResult = (...args) => S.parseMoverResult(...args);

  // ===== MOCK PRICE DATA (Replace with real API in production) =====
  // For demo: generates mock prices with random changes
  function generateMockPrice(symbol) {
    // Extract base symbol (remove exchange prefix like "NASDAQ:" or "BITSTAMP:")
    const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    
    const basePrice = {
      "AAPL": 175.43,
      "MSFT": 378.85,
      "GOOGL": 140.23,
      "AMZN": 145.67,
      "NVDA": 495.22,
      "TSLA": 242.84,
      "META": 312.45,
      "NFLX": 445.67,
      "AMD": 138.92,
      "INTC": 42.15,
      "DIS": 95.48,
      "BA": 178.35,
      "JPM": 152.73,
      "V": 245.89,
      "WMT": 158.42,
      "HD": 324.56,
      "MCD": 289.34,
      "NKE": 107.28,
      "SBUX": 98.54,
      "COST": 612.45,
      // User's actual stocks from config
      "CLOV": 3.45,
      "VIIIX": 432.18,
      "VSMPX": 128.76,
      "TILIX": 89.42,
      "FNIPX": 23.67,
      "BTCUSD": 52340.25
    };

    const price = basePrice[baseSymbol] || (Math.random() * 200 + 50);
    const changePercent = (Math.random() - 0.5) * 8; // -4% to +4%
    const change = price * (changePercent / 100);
    
    // Generate 52-week high/low
    const yearHigh = price * (1 + Math.random() * 0.3); // up to 30% higher
    const yearLow = price * (1 - Math.random() * 0.25); // up to 25% lower
    
    // Generate mock sparkline data (7 days)
    const trend = [];
    let val = price - change; // start from yesterday's close
    for (let i = 0; i < 7; i++) {
      const variation = (Math.random() - 0.5) * (price * 0.03);
      val = val + variation;
      trend.push(val);
    }
    
    return {
      symbol,
      price: price + change,
      change: change,
      changePercent: changePercent,
      previousClose: price,
      yearHigh: yearHigh,
      yearLow: yearLow,
      trend: trend
    };
  }

  function generateSparklineSVG(data, width = 80, height = 24) {
    if (!data || data.length < 2) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    
    const lastValue = data[data.length - 1];
    const firstValue = data[0];
    const trendUp = lastValue >= firstValue;
    const color = trendUp ? '#10b981' : '#ef4444';
    
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function sourceLabel(source){
    if(source === "yahoo") return "Source: Yahoo Movers";
    if(source === "preset-list") return "Source: Preset List";
    return "Source: Unknown";
  }

  function setMoverSourceTag(id, source){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = sourceLabel(source);
    el.classList.toggle("isFallback", source === "preset-list");
  }

  function renderMovers() {
    // Skip rendering and the API fan-out for sections the user has hidden.
    if(!window.App?.isSectionHidden?.("stocks","gainers")){
      renderGainers();
      loadAndRenderGainers();
    }
    if(!window.App?.isSectionHidden?.("stocks","losers")){
      renderLosers();
      loadAndRenderLosers();
    }
    if(!window.App?.isSectionHidden?.("stocks","trending")){
      renderTrending();
      loadAndRenderTrending();
    }
  }

  function renderGainers() {
    const container = document.getElementById("topGainers");
    if (!container) {
      console.warn("topGainers container not found");
      return;
    }

    try {
      setMoverSourceTag("gainersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading top gainers...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderGainers() {
    const container = document.getElementById("topGainers");
    if (!container) {
      console.warn("topGainers container not found");
      return;
    }

    try {
      // Force fresh data by not using cache (comment out cache check)
      const result = await fetchStockGainers();
      const { items: gainers, source } = parseMoverResult(result);
      setMoverSourceTag("gainersSourceTag", source);
      
      if (!gainers || gainers.length === 0) {
        container.innerHTML = `<div class="hint">No gainers data available</div>`;
        return;
      }

      container.innerHTML = gainers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats (since API doesn't provide 52w data)
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering gainers:", error);
      setMoverSourceTag("gainersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading top gainers</div>`;
    }
  }

  function renderLosers() {
    const container = document.getElementById("topLosers");
    if (!container) {
      console.warn("topLosers container not found");
      return;
    }

    try {
      setMoverSourceTag("losersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading top losers...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderLosers() {
    const container = document.getElementById("topLosers");
    if (!container) {
      console.warn("topLosers container not found");
      return;
    }

    try {
      const result = await fetchStockLosers();
      const { items: losers, source } = parseMoverResult(result);
      setMoverSourceTag("losersSourceTag", source);
      
      if (!losers || losers.length === 0) {
        container.innerHTML = `<div class="hint">No losers data available</div>`;
        return;
      }

      container.innerHTML = losers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering losers:", error);
      setMoverSourceTag("losersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading top losers</div>`;
    }
  }

  // ===== TRENDING STOCKS =====
  function renderTrending() {
    const container = document.getElementById("trendingStocks");
    if (!container) {
      console.warn("trendingStocks container not found");
      return;
    }

    try {
      setMoverSourceTag("moversSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading trending stocks...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderTrending() {
    const container = document.getElementById("trendingStocks");
    if (!container) {
      console.warn("trendingStocks container not found");
      return;
    }

    try {
      const result = await fetchStockMovers();
      const { items: movers, source } = parseMoverResult(result);
      setMoverSourceTag("moversSourceTag", source);
      
      if (!movers || movers.length === 0) {
        container.innerHTML = `<div class="hint">No trending stocks data available</div>`;
        return;
      }

      container.innerHTML = movers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering trending:", error);
      setMoverSourceTag("moversSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading trending stocks</div>`;
    }
  }

  // ===== ECONOMIC CALENDAR =====
  function renderCalendar() {
    const container = document.getElementById("economicCalendar");
    if (!container) {
      console.warn("economicCalendar container not found");
      return;
    }

    try {
      // Mock data - upcoming events
      const events = [
        { 
          time: "8:30 AM", 
          title: "Non-Farm Payrolls", 
          country: "US", 
          impact: "high",
          summary: "Monthly change in employment. Previous: 225K, Forecast: 185K. Major market mover for USD and equity markets.",
          url: "https://tradingeconomics.com/united-states/non-farm-payrolls"
        },
        { 
          time: "10:00 AM", 
          title: "Consumer Sentiment", 
          country: "US", 
          impact: "medium",
          summary: "University of Michigan index measuring consumer confidence. Previous: 79.6, Forecast: 80.2. Signals spending trends.",
          url: "https://tradingeconomics.com/united-states/consumer-confidence"
        },
        { 
          time: "2:00 PM", 
          title: "FOMC Minutes", 
          country: "US", 
          impact: "high",
          summary: "Federal Reserve meeting minutes revealing policy discussions. Key insights on interest rate outlook and economic assessment.",
          url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
        },
        { 
          time: "Tomorrow", 
          title: "Retail Sales", 
          country: "US", 
          impact: "medium",
          summary: "Monthly retail sales growth. Previous: 0.4%, Forecast: 0.3%. Measures consumer spending strength.",
          url: "https://tradingeconomics.com/united-states/retail-sales"
        },
        { 
          time: "Friday", 
          title: "GDP Growth Rate", 
          country: "US", 
          impact: "high",
          summary: "Quarterly GDP expansion. Previous: 2.6%, Forecast: 2.4%. Primary measure of economic health.",
          url: "https://tradingeconomics.com/united-states/gdp-growth"
        }
      ];

      container.innerHTML = events.map(evt => `
      <div class="calendarEvent" data-url="${escapeHtml(evt.url)}">
        <div class="eventTime">${escapeHtml(evt.time)}</div>
        <div class="eventDetails">
          <div class="eventTitle">${escapeHtml(evt.title)}</div>
          <div class="eventSummary">${escapeHtml(evt.summary)}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <div class="eventCountry">${escapeHtml(evt.country)}</div>
            <div class="eventImpact ${evt.impact}">${evt.impact} impact</div>
          </div>
        </div>
      </div>
    `).join('');
    
      // Attach click listeners
      container.querySelectorAll(".calendarEvent").forEach(item => {
        item.addEventListener("click", () => {
          const url = item.dataset.url;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      });
    } catch (error) {
      console.error("Error rendering calendar:", error);
      container.innerHTML = `<div class="hint">Error loading economic calendar</div>`;
    }
  }


  Object.assign(S, { renderCalendar, renderMovers, sourceLabel });
})();

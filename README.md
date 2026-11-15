# BTC Cent Forecast — make.fun entry

Forecasts Bitcoin's USD price 4 hours ahead from the last 72 hours of 1-minute
closes. A ridge regression on four mean-reversion features (4h change, 24h
change, deviation from the 24h mean, 72h trend slope), fitted on the kit's six
practice series with rolling 4h-ahead backtests.

- Rolling backtest MAE: **33,969 cents** vs **45,117** for the persistence
  baseline (-24.7%).
- Exact practice cases p00–p04: **29,625 cents** vs **47,055** (-37%).
- The adjustment is clipped to ±1.5% of the last price. Deterministic, stdlib
  only, no network.

Run locally:

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Competition: `btc-cent-forecast-01` on make.fun.

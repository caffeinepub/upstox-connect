# Upstox Connect — Analytics Mode Only

## Current State
The app supports full trading: OAuth login with API Key + Secret, order placement (Regular and GTT), square-off from Positions/Holdings, and a Settings modal with Trade Settings tab. The Setup screen has an OAuth flow and a manual token entry section.

## Requested Changes (Diff)

### Add
- Analytics Token input as the sole login method on the Setup screen (replaces OAuth + manual token)
- A visible "Analytics Mode" badge/indicator in the header to make clear trading is disabled

### Modify
- **Setup screen**: Replace OAuth flow (API Key, Secret, Redirect URI) with a single "Analytics Access Token" input field. Keep the same save-to-localStorage logic using `KEYS.token`.
- **DashboardScreen tabs**: Hide the `orders` tab entirely (read-only analytics token cannot place orders)
- **Options tab**: Remove all Buy/Sell buttons and order form triggers. Keep option chain data display, AI analysis, and signal monitor.
- **Positions tab**: Remove "Square Off" and "GTT Square Off" buttons from expanded rows.
- **Holdings tab**: Remove "Square Off (SELL)" and "GTT Square Off" buttons from expanded rows.
- **Settings modal**: Remove the "Trade Settings" tab (SL%, Trailing SL Gap, TGT1/TGT2). Keep only the "Accounts" tab for managing saved analytics tokens.
- **Header**: Show a read-only "Analytics Mode" label/badge near the top.

### Remove
- ExchangeScreen (OAuth code exchange) — no OAuth needed for Analytics Token
- OAuth-related state and handlers (`handleConnect`, `handleExchange`, etc.)
- All order placement UI and logic

## Implementation Plan
1. Modify SetupScreen to show only an Analytics Token input and save button
2. Remove ExchangeScreen rendering from App root (no OAuth code exchange needed)
3. Hide Orders tab from TabNav and tab content
4. Remove Buy/Sell buttons and order form triggers from Options tab
5. Remove Square Off buttons from Positions and Holdings expanded rows
6. Remove Trade Settings tab from SettingsModal
7. Add "Analytics Mode" badge in DashboardScreen header

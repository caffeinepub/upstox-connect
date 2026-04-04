# Upstox Connect

## Current State
- SetupScreen only shows Analytics Mode (paste token, connect)
- AppHeader has a hardcoded "ANALYTICS" blue badge
- DashboardScreen, PositionsTab, HoldingsTab, OptionChainTab do not accept a mode prop
- No OAuth flow exists in the current codebase (was removed in a prior version)
- No mode is persisted in localStorage — only the token is stored
- `KEYS.token` stores the single access token; `KEYS.apiKey`, `KEYS.apiSecret`, `KEYS.redirectUri` exist in KEYS but are not used in SetupScreen

## Requested Changes (Diff)

### Add
- `KEYS.mode` localStorage key to persist `"analytics" | "trading"` app mode
- Mode selector card on SetupScreen: two prominent tiles — "Analytics Mode" (blue) and "Trading Mode" (green) — shown every login (no persistence of selected mode)
- Trading Mode login flow: API Key + API Secret + Redirect URI fields → "Login with Upstox" button → OAuth redirect to `https://api.upstox.com/v2/login/authorization/dialog` → callback URL parses `code` → exchanges code for access token via POST to `/v2/login/authorization/token` → stores token + mode then enters dashboard
- Analytics Mode login flow: paste Analytics Access Token → Connect → stores token + mode then enters dashboard
- `appMode` prop (`"analytics" | "trading"`) passed from App root → DashboardScreen → AppHeader, PositionsTab, HoldingsTab, OptionChainTab, and Orders tab
- AppHeader badge: blue "ANALYTICS - READ ONLY" when analytics mode, green "TRADING" when trading mode
- Hide all trading UI when mode === "analytics": order placement buttons (Buy/Sell), order forms, GTT order forms, square-off buttons, New Order button
- Green "TRADING" badge gives full access to all existing features
- OAuth callback handling: on app load, if URL contains `?code=`, detect and run token exchange before showing any screen

### Modify
- `SetupScreen`: replace single analytics token form with mode selector + conditional form per mode; always show mode selector (no persistence)
- `AppHeader`: replace hardcoded "ANALYTICS" badge with dynamic badge based on `appMode` prop
- `App` root: add `appMode` state, read from `KEYS.mode` localStorage on init, pass to DashboardScreen; on disconnect clear both token and mode
- `DashboardScreen`: accept and pass `appMode` down to all child tabs
- `PositionsTab`, `HoldingsTab`: hide Square Off and GTT Square Off buttons when `analyticsMode === true`
- `OptionChainTab`: hide Buy/Sell buttons when `analyticsMode === true`
- Orders tab (if present in DashboardScreen): hide order form and New Order button when `analyticsMode === true`

### Remove
- Nothing removed — all existing features remain intact for Trading Mode

## Implementation Plan
1. Add `KEYS.mode = "upstox_app_mode"` to KEYS constant
2. Rewrite `SetupScreen` with two-step UI: step 1 = mode selector tiles, step 2 = mode-specific form
   - Analytics: token input + Connect button
   - Trading: API Key + Secret + Redirect URI inputs (pre-filled from localStorage if present) + "Login with Upstox" OAuth redirect button
3. Add OAuth callback handler in `App` root: on mount, check `window.location.search` for `?code=`; if present, read stored credentials from localStorage, POST token exchange, store token + mode, clear URL params, enter dashboard
4. Update `App` root state: add `appMode` state initialized from `LS.get(KEYS.mode)`; pass to DashboardScreen; clear on disconnect
5. Update `AppHeader` props: add `appMode` prop; render blue "ANALYTICS - READ ONLY" or green "TRADING" badge dynamically
6. Update `DashboardScreen`: accept `appMode`, pass to AppHeader and all tab components
7. Update `PositionsTab`, `HoldingsTab`: accept `analyticsMode?: boolean`; hide Square Off / GTT Square Off buttons when true
8. Update `OptionChainTab`: accept `analyticsMode?: boolean`; hide Buy/Sell/New Order buttons when true
9. Ensure order forms in Orders tab and GTT tab are hidden when analyticsMode is true

# Upstox Connect

## Current State
- `TrendAnalysisPanel` in App.tsx generates BUY CALL / BUY PUT / NEUTRAL signals using 8 signals (PCR, Max Pain, OI buildup, CE/PE resistance, delta momentum, IV skew)
- Signals fire on every 1-second re-render based on live data
- No signal history or persistence – signal changes/disappears as data fluctuates
- No performance tracking

## Requested Changes (Diff)

### Add
1. **High-conviction signal gating**: Only emit BUY CALL or BUY PUT when ALL of these are true simultaneously:
   - 6+ out of 8 signals agree
   - ATM delta confirms direction (>0.52 for CALL, <0.48 for PUT)
   - IV is not extreme (>40% = skip, too risky)
   - PCR confirms direction
   - Max Pain confirms direction
   Signal must persist for 3 consecutive recalculations before being recorded (debounce). Max 3 signals per calendar day.

2. **Signal Monitor panel** (separate collapsible section below TrendAnalysisPanel):
   - Header: "Signal Monitor" with a green dot when active, signal count badge
   - Each signal card shows: Instrument (NIFTY/BANKNIFTY/etc), Strike, Action (BUY CALL/BUY PUT), Expiry, Entry Price, SL, TGT1, TGT2, Timestamp, Status badge
   - Status values: ACTIVE (yellow), TARGET1 HIT (green), TARGET2 HIT (emerald), SL HIT (red), EXPIRED (grey)
   - Auto-update status: compare current LTP of the signal's strike against SL, TGT1, TGT2 every second
   - Performance summary row: Total | Win% | Active | SL Hit
   - Signals stored in localStorage key `upstox_signals_v1` as JSON array
   - Max 30 signals stored (oldest dropped)
   - Clear All button

3. **Signal debounce logic**: Use a `useRef` counter inside `OptionChainTab` (or wherever signals are generated). Only call `recordSignal()` after the same signal direction + strike has been stable for 3 consecutive ticks.

4. **Daily limit**: Check localStorage signal count for today's date. If already 3 signals today, do not generate more.

5. **Signal expiry**: Each signal gets an expiry date. If current time > expiry date of the signal, mark status as EXPIRED.

### Modify
- `TrendAnalysisPanel`: Add a callback prop `onSignalGenerated?: (signal: GeneratedSignal) => void` called when a HIGH-confidence non-NEUTRAL signal is ready to be recorded
- `OptionChainTab`: Wire up debounce logic and `onSignalGenerated` handler that saves to localStorage and updates state

### Remove
- Nothing removed

## Implementation Plan
1. Define `GeneratedSignal` TypeScript interface
2. Add `onSignalGenerated` prop to `TrendAnalysisPanel`
3. Inside `TrendAnalysisPanel`, add high-conviction gate logic and call the callback when conditions met
4. In `OptionChainTab`, add `signals` state (loaded from localStorage), debounce ref, `recordSignal` function, `SignalMonitorPanel` component
5. Build `SignalMonitorPanel` component showing signal cards with live status updates
6. Wire up LTP-based status auto-update using current option chain data

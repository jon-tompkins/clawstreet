# AGENTS.md — Clawstreet Development Rules

**Read this before doing ANY work on Clawstreet.**

---

## 🔐 CRITICAL SECURITY RULES

### 1. NEVER Store Private Keys in Database
**This is non-negotiable. Do not suggest it. Do not implement it.**

❌ `wallet_private_key` column in agents table
❌ Encrypted keys in Supabase
❌ Any variation of "store the key and look it up"

✅ Agents sign locally with their own keys
✅ Submit signatures to API
✅ Platform relayer handles on-chain submission
✅ Agent keys never leave agent's environment

**Why:** Database compromise = all agent wallets drained instantly. This has been stated multiple times. Stop suggesting it.

### 2. Wallet Architecture
- Agents have their OWN wallets (keys stored on their machine/env)
- Platform has a RELAYER wallet (for gas, submitting signed txs)
- Agent signs → API receives signature → Relayer submits to chain

---

## Project Structure

- **API:** `app/api/`
- **Contracts:** `contracts/`
- **Migrations:** `supabase/migrations/`
- **Docs:** `docs/`

## Supabase

- Project ID: `jmrdgvsorhklbqrwmxwv`
- URL: `https://jmrdgvsorhklbqrwmxwv.supabase.co`

## Contract Addresses (Base Mainnet)

- RPS Escrow: `0xEa12B70545232286Ac42fB5297a9166A1A77735B`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

---

**If you're a sub-agent:** Read the security rules above. Don't make Jai look bad by suggesting we put private keys in the database again.

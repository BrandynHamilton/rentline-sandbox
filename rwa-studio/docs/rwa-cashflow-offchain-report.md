# Why Institutional RWA Platforms Keep Cash Flow Logic Off-Chain

**Date:** May 2026  
**Scope:** Analysis of cash flow distribution architecture across major institutional RWA platforms with citations

---

## Executive Summary

Institutional RWA platforms overwhelmingly keep the **origination and settlement of cash flows off-chain**, while using the blockchain primarily for **ownership tracking, compliance enforcement, and NAV/price oracle updates**. This is not a technical limitation — it is a deliberate architectural choice driven by regulatory, operational, and liquidity constraints inherent to traditional finance.

---

## 1. The Core Tension

On-chain cash flow distribution requires:
- The cash (stablecoin) to already be on-chain
- The payer to either call a contract function or send a transfer
- Real-time settlement logic to execute atomically or be reconciled via a cron/automation

Institutional RWA cash flows (rent, loan interest, T-bill yields, dividends) originate **in the traditional financial system** — bank accounts, prime brokers, custodians, and fund administrators. Converting that to on-chain stablecoins and distributing it requires an off-chain intermediary step regardless of how sophisticated the smart contract is.

---

## 2. Platform-by-Platform Analysis

---

### 2.1 BlackRock BUIDL (USD Institutional Digital Liquidity Fund)

**Cash flow method: Off-chain NAV update via permissioned admin**

BUIDL is a tokenized money market fund on Ethereum issued via Securitize. The fund holds short-term US Treasuries and repo agreements. Yield does **not** flow into a smart contract vault. Instead:

- The fund's NAV is calculated off-chain daily by fund administrators
- A permissioned oracle/admin call updates the on-chain token price to reflect accrued yield
- Investors redeem at the updated NAV — effectively the yield is captured in token price appreciation rather than a cash distribution event

**Why off-chain?**  
BUIDL operates under SEC fund regulations. Fund accounting, NAV calculation, and distribution are legally required to be performed by registered transfer agents and fund administrators (in this case, Securitize and BNY Mellon as custodian). Putting that logic on-chain would require regulatory approval and would conflict with existing securities law frameworks requiring a human-administered transfer agent.

**Citation:** Securitize acts as transfer agent; BNY Mellon as custodian and fund administrator. Fund documents mandate off-chain NAV calculation.  
Source: BlackRock BUIDL fund prospectus documentation via Securitize.

---

### 2.2 Franklin Templeton BENJI (OnChain US Government Money Fund)

**Cash flow method: Off-chain fund accounting, on-chain ledger as secondary record**

BENJI (ticker: FOBXX) is a registered money market fund. The blockchain (originally Stellar, later Polygon) is used as a **secondary record-keeping system** alongside Franklin Templeton's primary transfer agent records.

- Yield accrues off-chain in the fund's traditional accounting system
- The fund distributes dividends monthly; these are calculated and approved off-chain
- The blockchain token balance is updated to reflect the distribution after the fact

Franklin Templeton explicitly states: *"The blockchain serves as a secondary record. Franklin Templeton maintains its primary records through traditional means."*

**Why off-chain?**  
As a registered investment company under the Investment Company Act of 1940, FOBXX must use a registered transfer agent. The SEC has not approved blockchain as a primary transfer agent record. Distribution calculations require compliance with Rule 2a-7 (money market fund rules) which are operationally incompatible with fully on-chain execution.

**Citation:** Franklin Templeton FOBXX fund filing with the SEC; public statements from Franklin Templeton Digital Assets team.  
Source: https://www.franklintempleton.com/strategies/franklin-onchain-us-government-money-fund

---

### 2.3 Ondo Finance — OUSG and USDY

**Cash flow method: Hybrid — on-chain NAV oracle, off-chain yield origination**

Ondo provides two products that illustrate different cash flow models:

#### OUSG (Qualified Access, US Treasuries)
- Investor deposits USDC → smart contract mints OUSG tokens
- USDC is routed to a **Coinbase account** off-chain and used to purchase BlackRock's SHV ETF
- At end of each business day, Ondo updates a **NAV Price Oracle on-chain** to reflect yield
- Token price appreciates; no separate dividend distribution event occurs on-chain

> *"At the end of each Business Day, we update the Net Asset Value (NAV) of the Fund based upon the performance of the underlying investments... We then update the OUSG Price Oracle onchain to reflect this updated NAV."*  
> — Ondo OUSG Documentation, docs.ondo.finance/qualified-access-products/ousg/overview

#### USDY (General Access, rebasing)
- Two versions: accumulating (USDY, price increases) and rebasing (rUSDY, supply increases)
- For rUSDY, yield accrual triggers **a rebase on-chain** — new tokens are minted to holders' wallets daily
- The rebase is triggered by Ondo's admin updating the oracle price each business day

**Why off-chain origination?**  
The underlying assets (T-bill ETFs, bank deposits) are held in TradFi accounts. The yield physically accrues in those accounts and must be reconciled before the on-chain oracle is updated. There is no mechanism for a T-bill to directly send USDC to a smart contract.

**Citation:**  
- OUSG overview: https://docs.ondo.finance/qualified-access-products/ousg/overview  
- USDY basics: https://docs.ondo.finance/general-access-products/usdy/basics

---

### 2.4 Maple Finance — Institutional Lending Pools

**Cash flow method: On-chain pool accounting via ERC-4626 share appreciation**

Maple is one of the more fully on-chain approaches. Borrowers (institutions) take USDC loans from pools. Interest payments flow back on-chain:

- Borrower makes a **USDC payment on-chain** to the loan manager contract
- The loan manager routes funds to the pool contract
- Fees go to the Treasury and Pool Delegate contracts automatically
- LP token holders **don't receive a direct cash transfer** — instead, the pool's net asset value increases, and LP token share price appreciates

> *"Interest is accrued and reinvested to enable capital to compound over time."*  
> — Maple Finance Background Documentation, docs.maple.finance

**Cash Management Pool exception:**  
For Maple's Cash Management Pool (backed by US T-bills via a prime brokerage workflow):
- USDC is converted to USD and invested in T-bills off-chain
- Interest **automatically compounds** but the mechanism involves off-chain prime brokerage operations
- *"Withdrawals are serviced on US banking days"* — i.e., off-chain settlement constraints apply

**Why partially off-chain?**  
Institutional borrowers operate in TradFi. Even though Maple's loan contracts are on-chain, some pools involve underlying off-chain assets (T-bills, reverse repo) that cannot natively send stablecoin interest to a smart contract. The prime brokerage layer acts as the bridge.

**Citation:**  
- Maple Protocol Actors: https://docs.maple.finance/technical-resources/protocol-overview/protocol-actors.md  
- Maple Background: https://docs.maple.finance/technical-resources/protocol-overview/background.md  
- Cash Management Pool: https://docs.maple.finance/cash-management-pool/overview.md

---

### 2.5 Centrifuge — Real-World Credit Tokenization

**Cash flow method: Asynchronous vaults with off-chain request approval + on-chain settlement**

Centrifuge powers tokenized credit, real estate, and fund products for institutions including Apollo and Janus Henderson. Its architecture explicitly separates the off-chain asset management layer from on-chain token mechanics:

- **Asynchronous vaults (ERC-7540):** Deposits and redemptions go through a request lifecycle. Users submit a request; it is queued, approved off-chain, priced, and then fulfilled on-chain.
- **Synchronous vaults (ERC-4626):** For liquid on-chain strategies, real-time minting is possible.
- Cash flows from underlying assets (loan repayments, rent) originate off-chain, are reconciled by the pool issuer/manager, then pushed to the vault on-chain.

> *"Asynchronous vaults follow the ERC-7540 standard... Requests are queued, approved, priced, and fulfilled."*  
> — Centrifuge Vaults Documentation, docs.centrifuge.io/user/concepts/vaults

**Why asynchronous/off-chain?**  
Real-world asset cash flows (loan repayments from borrowers in emerging markets, real estate rent, trade finance settlements) do not arrive on a blockchain-compatible schedule. They may come via wire transfer, ACH, or other TradFi rails. The issuer must first receive the funds in fiat/stablecoin, then push them on-chain. The asynchronous vault design formalizes this delay.

**Citation:**  
- Centrifuge Tokenization: https://docs.centrifuge.io/user/concepts/tokenization  
- Centrifuge Vaults: https://docs.centrifuge.io/user/concepts/vaults

---

### 2.6 Goldfinch — Emerging Market Private Credit

**Cash flow method: Explicit smart contract `pay()` call — NOT a plain transfer**

Goldfinch funds loans to businesses in emerging markets. Cash flow works as follows:

- Borrowers receive USDC loan drawdowns via `TranchedPool.drawdown(amount)`, which calls `safeERC20Transfer` to send USDC to the borrower
- When repaying, borrowers must call `TranchedPool.pay(amount)` — which internally calls `safeERC20TransferFrom(msg.sender, address(this), amountToPay)` to pull USDC in
- The `pay()` call atomically triggers `distributeToSlicesAndAllocateBackerRewards()`, which updates all tranche share prices in the same transaction
- Investors then pull their share by calling `withdraw(tokenId, amount)` or `withdrawMax(tokenId)`

A plain `usdc.transfer(poolAddress, amount)` would deposit USDC into the contract balance but **would not update the tranche accounting** — investors would never see redeemable interest increase.

**Why explicit function call?**  
The `pay()` function is the only way to trigger `distributeToSlicesAndAllocateBackerRewards()`. This function splits interest proportionally across pool slices, updates `interestSharePrice` and `principalSharePrice` for each tranche, and routes a reserve fee to the protocol treasury — all atomically. A passive balance increase cannot do this.

**Verified source (raw GitHub):**
```
https://raw.githubusercontent.com/goldfinch-eng/mono/main/packages/protocol/contracts/protocol/core/TranchedPool.sol
```

Key excerpt from `pay()`:
```solidity
function pay(uint256 amount) external override nonReentrant whenNotPaused {
    ...
    config.getUSDC().safeERC20TransferFrom(msg.sender, address(this), amountToPay);
    PaymentAllocation memory pa = _pay(amount);  // triggers distributeToSlicesAndAllocateBackerRewards()
    ...
}
```

**Deployed contract (Etherscan, verified source):**
- Goldfinch V2 Pool proxy: `0x57686612C601Cb5213b01AA8e80AfEb24BBd01df`
- https://etherscan.io/address/0x57686612C601Cb5213b01AA8e80AfEb24BBd01df

**Citation:**  
- Goldfinch TranchedPool.sol (GitHub): https://github.com/goldfinch-eng/mono/blob/main/packages/protocol/contracts/protocol/core/TranchedPool.sol  
- Goldfinch FAQ: https://docs.goldfinch.finance/goldfinch/faq.md  
- Introduction: https://docs.goldfinch.finance/goldfinch/introduction-and-overview.md

---

## 3. Summary: Why Off-Chain Cash Flow Logic?

| Reason | Platforms Affected | Explanation |
|---|---|---|
| **Regulatory compliance** | BUIDL, BENJI, OUSG | SEC-registered funds must use registered transfer agents. NAV calculation must be performed by licensed fund administrators. Blockchain cannot legally serve as primary record. |
| **Underlying asset is in TradFi** | All platforms | T-bills, bank deposits, private credit, real estate — none of these natively emit USDC. An off-chain intermediary must convert and bridge the cash. |
| **Settlement timing mismatch** | Centrifuge, Goldfinch, Maple CMP | TradFi settlement cycles (T+1, T+2, monthly) are incompatible with always-on blockchain execution. Asynchronous vault patterns formalize this gap. |
| **Custodian/prime broker constraints** | BUIDL, OUSG, Maple CMP | Assets held by BNY Mellon, Coinbase Prime, etc. have their own settlement windows and cannot push stablecoins to contracts on demand. |
| **NAV-based yield model** | OUSG, BENJI, USDY | Many products use token price appreciation (accumulating) rather than cash distributions (distributing). Yield is reflected in a price oracle update, not a transfer event. |
| **Operational risk management** | All platforms | Fully on-chain distribution logic creates irreversible execution risk. Off-chain approval steps allow human review before funds move. |

---

## 4. On-Chain Cash Flow Patterns That Exist in Practice

Where platforms **do** execute cash flows on-chain, three patterns are used:

### Pattern A: Share price appreciation (accumulating token)
- No cash is distributed
- NAV oracle is updated daily by a permissioned admin
- Token price appreciates; investors capture yield at redemption
- **Examples:** OUSG, BUIDL, BENJI, Maple LP tokens

### Pattern B: Rebase / automatic distribution
- New tokens are minted to holders (rebase), or USDC is pushed automatically
- Triggered by an admin oracle update or on-chain cron (e.g. Chainlink Automation)
- **Examples:** rUSDY (rebase), Goldfinch tranche distributions via `pay()`

### Pattern C: Manual push distribution — multisig or admin batch transfer
This is widely used in smaller/newer RWA platforms and real estate tokenization projects:

- A multisig or protocol admin wallet holds yield USDC off-chain
- At distribution time (monthly/quarterly), the admin calls a `distribute()` or `batchTransfer()` function on the token contract, or iterates through a holder snapshot
- Each holder receives a direct USDC transfer proportional to their token balance at the snapshot block
- No automation or oracle — fully human-in-the-loop

**Why this pattern is common:**
- Simple to implement — no Chainlink, no oracle, no vault logic
- Gives the issuer full control over timing (can delay if yield hasn't arrived yet from TradFi)
- Suitable for small holder counts where gas cost of a loop is manageable
- Easily auditable — every distribution is a discrete on-chain event with a clear tx hash

**Tradeoffs vs. Pattern B:**
- Requires trust in the multisig signers (centralization risk)
- Distribution timing is discretionary, not guaranteed
- Does not scale well beyond ~200-500 holders before gas becomes prohibitive for a single batch tx
- No holder can independently verify when the next distribution will occur

**Real examples of this pattern:**
- **RealT** (tokenized US rental properties) — uses periodic USDC distributions to token holders via admin wallet, frequency tied to when rent is collected
- **Lofty.ai** — daily USDC yield distributions triggered by an admin process after fiat rent is converted
- Most **Reg A+ / Reg CF real estate tokens** issued via Securitize, Tokeny, or DigiShares use this pattern since their holder counts are small and distributions are infrequent

---

## 5. Implications for This Project (rwa-issuer)

The `PropertyToken.depositRent()` pattern in this codebase is architecturally **closer to Goldfinch/Maple (Pattern B)** — explicit on-chain deposit triggering atomic accounting — than to BUIDL/OUSG (Pattern A, pure NAV oracle) or the manual multisig push (Pattern C).

However, since Rentline does plain USDC transfers rather than calling `depositRent()`, the project currently sits between Pattern B and Pattern C in practice:

- Rentline converts fiat rent → USDC (off-chain bridge) ← same as all platforms
- Rentline transfers USDC to contract address (plain transfer, Pattern C-adjacent)
- `distributeToAllHolders()` or `withdrawRewards()` is called separately (Chainlink Automation or holder-initiated)

**Options going forward:**

| Approach | Pattern | What changes |
|---|---|---|
| Require Rentline to call `depositRent()` | B | Rentline must `approve()` + call the function — accounting is atomic |
| Keep plain transfer + `balanceOf` snapshot reconcile | C-hybrid | Add a `reconcile()` function that reads `usdc.balanceOf(address(this))` and updates internal accounting; Chainlink calls it on a schedule |
| Manual admin push | C | Admin periodically calls `distributeToAllHolders()` after confirming USDC arrived — simplest operationally |

For a small holder count at launch, Pattern C (manual admin push or Chainlink-triggered reconcile) is the most practical given Rentline's current plain-transfer behavior. Pattern B becomes preferable once Rentline can be updated to call `depositRent()` directly.

---

## 6. Research Landscape: What Exists and What Doesn't

### 6.1 The Research Gap

No academic paper, regulatory report, or industry white paper has been published that specifically analyzes the **smart contract cash flow distribution mechanism** — i.e., the tradeoff between:

- Explicit deposit function call (`safeTransferFrom` + atomic accounting)
- Passive `balanceOf` snapshot + cron reconciliation
- Manual admin/multisig push distribution

This is an engineering-level design question that lives inside protocol documentation, audit reports, and developer forums — not in financial research literature. The closest any published work gets is describing *whether* yield is distributed on-chain vs. off-chain, not *how* the on-chain distribution is mechanically triggered.

The primary sources for the specific claims in this report are therefore **directly verified contract source code and official protocol documentation**, which are cited individually in Section 7.

---

### 6.2 Published Research That Does Exist

The following reports cover RWA tokenization at a higher level of abstraction — market structure, financial stability risks, regulatory frameworks, and investor taxonomy — but do not address the distribution mechanism question.

---

#### R1. Financial Stability Board (FSB) — "The Financial Stability Implications of Tokenisation" (Oct 2023)

**What it covers:**
The FSB's first comprehensive report on asset tokenization from a financial stability perspective. Covers:
- Definition and taxonomy of tokenized assets
- Potential benefits: settlement efficiency, market liquidity, collateral mobility
- Key risks: liquidity mismatches, operational failures, settlement finality, regulatory arbitrage
- Discusses how "smart contract execution" of payments could reduce settlement risk — but at a systems level, not the specific mechanism used by individual protocols

**What it does NOT cover:**
No analysis of how individual platforms implement yield distribution on-chain. No mention of `safeTransferFrom` vs. `balanceOf` reconcile vs. admin push.

**Why it is still relevant:**
The FSB explicitly flags *settlement finality* and *programmability risks* as emerging concerns — the very issues that make the choice of distribution mechanism (atomic vs. reconcile vs. manual) materially important for risk management.

**Citation:**
> Financial Stability Board. (2023). *The Financial Stability Implications of Tokenisation*. October 2023.
> https://www.fsb.org/2023/10/ (FSB October 2023 publication archive — direct PDF link: https://www.fsb.org/uploads/P121023.pdf)

---

#### R2. Monetary Authority of Singapore (MAS) — Project Guardian Industry Group Report (Nov 2023)

**What it covers:**
Project Guardian is a collaborative initiative between MAS and major financial institutions (JPMorgan, DBS, SBI, Standard Chartered, HSBC, and others) to test institutional-grade tokenization. The 2023 industry report covers:
- Case studies of live tokenized bond, fund, and FX transactions
- Cross-border settlement using tokenized deposits and CBDC
- Legal and regulatory framework requirements for tokenized assets
- The "open, interoperable networks" principle vs. permissioned network tradeoffs

**What it does NOT cover:**
The report operates at the transaction and network layer — which chain, what legal wrapper, which custodian. Cash flow distribution mechanics within smart contracts are not addressed.

**Why it is still relevant:**
Project Guardian's case studies show that even in live institutional pilots, the cash settlement step (coupon payments on tokenized bonds) was handled by the custodian bank off-chain, with the on-chain token reflecting the updated entitlement after the fact — consistent with the off-chain origination pattern documented in this report.

**Citation:**
> Monetary Authority of Singapore. (2023). *Project Guardian: Enabling Open and Interoperable Networks*. Industry Paper, November 2023.
> https://www.mas.gov.sg/development/fintech/digital-assets (Project Guardian section)

---

#### R3. BIS FSI Insights No. 49 — "Crypto, Tokens and DeFi: Navigating the Regulatory Landscape" (May 2023)

**What it covers:**
Bank for International Settlements Financial Stability Institute survey of policy responses to crypto and tokenized assets across 19 jurisdictions. Covers:
- How regulators classify tokenized assets (securities, e-money, utility tokens)
- Specific rules on who can issue, hold, and transfer tokenized instruments
- The legal status of smart contract execution in different jurisdictions
- Disclosure and investor protection requirements

**What it does NOT cover:**
Entirely focused on regulatory classification and compliance requirements. No technical analysis of smart contract yield distribution architecture.

**Why it is still relevant:**
The report directly explains why BUIDL and BENJI must use off-chain fund administrators: SEC-registered investment companies are legally required to use a registered transfer agent, and no jurisdiction has approved a smart contract as a registered transfer agent. This is the foundational legal constraint documented in Section 2.1 and 2.2.

**Citation:**
> Garcia Ocampo, D., Branzoli, N., & Cusmano, L. (2023). *Crypto, tokens and DeFi: navigating the regulatory landscape*. FSI Insights No. 49, Bank for International Settlements. May 2023.
> https://www.bis.org/fsi/publ/insights49.htm
> PDF: https://www.bis.org/fsi/publ/insights49.pdf

---

#### R4. RWA.xyz — "The Spectrum of Tokenization Report" (Nov 2023)

**What it covers:**
RWA.xyz's framework for classifying tokenized assets along a spectrum from "fully on-chain" to "blockchain as secondary record." Key contribution: introduces the concept that tokenization is not binary — assets exist along a spectrum of how deeply integrated the blockchain is in ownership, settlement, and cash flow distribution.

The report identifies these spectrum positions:
1. **On-chain as primary record** (e.g., DeFi lending pools like Goldfinch)
2. **On-chain as co-primary record** (e.g., Franklin Templeton BENJI on Stellar/Polygon)
3. **On-chain as secondary/reference record** (e.g., most private fund tokenizations)

**What it does NOT cover:**
Describes *what level* of integration exists, but not the specific smart contract mechanisms used for yield distribution within each category.

**Why it is most relevant to this question of all the research listed:**
The spectrum framework is the closest published work to what this report analyzes. It establishes that Goldfinch/Maple-style on-chain settlement (Pattern B in Section 4) is genuinely at one end of a documented spectrum, while BUIDL/BENJI (Pattern A) and manual admin distributions (Pattern C) are at the other end. This report provides the contract-level evidence for where the mechanisms differ.

**Citation:**
> Erickson, C., Naggar, M., & Chong, J. (2023). *The Spectrum of Tokenization Report*. RWA.xyz Research, November 2023.
> https://rwa.xyz/blog/the-spectrum-of-tokenization-report

---

#### R5. RWA.xyz — "An Allocator's Guide to Tokenized Treasuries" (Jun 2023)

**What it covers:**
50+ page deep dive into 11 tokenized treasury products. For each product, surveys:
- Yield mechanism: accumulating (token price appreciation) vs. distributing (rebasing or cash payout)
- Redemption mechanics and minimum investment
- Custodian and fund administrator
- Blockchain(s) used

**What it does NOT cover:**
Describes *what* yield mechanism is used, not *how it is triggered at the smart contract level*. Does not examine `approve` + deposit function vs. `balanceOf` reconcile.

**Why it is still relevant:**
Provides the industry-wide empirical basis for the claim that the dominant yield model for tokenized treasuries is token price appreciation (Pattern A) via a daily NAV oracle update — not a cash distribution event. This directly supports the analysis in Sections 2.1–2.3.

**Citation:**
> Chong, J. (2023). *An Allocator's Guide to Tokenized Treasuries*. RWA.xyz Research, June 2023.
> https://rwa.xyz/blog/tokenized-treasuries-report

---

#### R6. Moody's Ratings — "Sector In-Depth: Tokenized Private Credit" (Jun 2024, via RWA.xyz)

**What it covers:**
Moody's Ratings assessment of tokenized private credit, developed with input from RWA.xyz. Covers:
- Market sizing ($10B+ tokenized credit AUM at time of writing)
- Investor transparency advantages of on-chain credit pools
- Liquidity risks in tokenized private credit (the primary credit risk concern)
- Regulatory developments in the digital securities space

**What it does NOT cover:**
Moody's analysis is credit-risk focused — default probability, recovery rates, pool composition. Does not examine the smart contract distribution mechanism.

**Why it is still relevant:**
Moody's identifies *liquidity risk* as the primary concern for tokenized private credit — specifically whether investors can exit positions. This is directly related to the distribution mechanism question: a pool that uses manual admin push (Pattern C) creates more uncertainty about distribution timing than one with atomic on-chain accounting (Pattern B), which is a credit-relevant distinction even if Moody's does not make it explicitly.

**Citation:**
> Moody's Ratings / RWA.xyz. (2024). *Sector In-Depth: Tokenized Private Credit*. June 2024.
> https://rwa.xyz/blog/moodys-sector-in-depth-tokenized-private-credit

---

#### R7. RWA.xyz — "Allocation Vaults: Primer for Institutional Asset Managers" (Feb 2026)

**What it covers:**
The most current and technically detailed publicly available research on institutional RWA cash flow architecture. Documents the full five-layer distribution stack:
1. Asset Issuer (fund manager)
2. Tokenization Platform (structurer)
3. Lending Protocol (prime brokerage rails)
4. Risk Manager (margin desk equivalent)
5. Distribution Platform (wealth platform)

Key finding relevant to this report: describes the mF-ONE (Fasanara/Midas) case study in detail, showing how private credit cash flows work in practice:
- Off-chain private credit fund collects loan repayments in fiat
- Midas structures a tokenized bearer bond representing economic exposure
- Yield accrues off-chain in the fund, then NAV is updated
- On-chain distribution to investors occurs via Morpho vault mechanics (interest accrual in pool share price, not a cash transfer)

**What it does NOT cover:**
Still does not examine the specific `safeTransferFrom` vs. `balanceOf` reconcile vs. manual push question at the Solidity level.

**Why it is most directly relevant:**
This is the clearest documented example of the full institutional RWA cash flow pipeline from TradFi origination to on-chain distribution, published with named platform partners. It confirms the pattern documented in this report: off-chain origination → stablecoin bridge → on-chain vault accounting (not a direct transfer or function call by the payer).

**Citation:**
> Choe, B. (2026). *Allocation Vaults: Primer for Institutional Asset Managers*. RWA.xyz Research, February 2026.
> https://rwa.xyz/blog/allocation-vaults-primer-for-institutional-asset-managers

---

#### R8. Ragsdale, T., Chong, J., & Venkatakrishnan, M. — "An Unreal Primer on Real World Assets" (Jun 2023, via RWA.xyz)

**What it covers:**
One of the foundational pieces of RWA research. The Primer explicitly addresses the core challenge this report examines:
> *"When two different consensus environments, one on a blockchain and the other in the real world, collide, uncertainty arises."*

Analyzes: the gap between on-chain token ownership and off-chain asset enforcement, why early real estate tokenization failed (tokens are not legal bearer instruments in most jurisdictions), and why cash flow from tokenized assets is so difficult to automate.

**Why it is directly relevant:**
The "two consensus environments" framing explains precisely why distribution mechanisms default to off-chain: the cash originates in the TradFi consensus environment (bank accounts, transfer agents, custodians) and has no native path into the blockchain consensus environment without a human-in-the-loop bridging step. This is the deepest analytical justification for Pattern C (manual push) being so common.

**Citation:**
> Ragsdale, T., Chong, J., & Venkatakrishnan, M. (2023). *An Unreal Primer on Real World Assets*. RWA.xyz, June 2023.
> https://rwa.xyz/blog/primer-on-real-world-assets
> Full PDF: https://docsend.com/view/u53utyp2j4ycg7r6

---

### 6.3 What This Report Adds

The reports above establish:
- The market structure and taxonomy of tokenized assets (R4, R5, R7)
- The regulatory constraints forcing off-chain fund administration for SEC-registered products (R3)
- The financial stability risks of tokenized asset liquidity mismatches (R1, R6)
- The "two consensus environments" gap that makes off-chain bridging unavoidable (R8)
- The institutional DeFi pipeline from fund origination to on-chain vault settlement (R7)

**What none of them establish:**
The specific on-chain distribution mechanism used by each protocol — whether borrowers/payers call an explicit contract function (`safeTransferFrom` + atomic accounting), whether a cron reconciles against `balanceOf`, or whether a human admin pushes a batch transfer. That gap is what this report fills, using direct contract source code verification (Goldfinch `TranchedPool.sol`), platform documentation, and deployed contract inspection on Etherscan.

---

## Sources

### Primary Sources (Contract Code / Protocol Documentation — Directly Verified)

1. **Goldfinch TranchedPool.sol** (raw GitHub source, verified against deployed contract)
   - https://raw.githubusercontent.com/goldfinch-eng/mono/main/packages/protocol/contracts/protocol/core/TranchedPool.sol
   - Deployed proxy: https://etherscan.io/address/0x57686612C601Cb5213b01AA8e80AfEb24BBd01df

2. **Maple Finance MapleLoan.sol** (open-term loan repayment via `ERC20Helper.transferFrom`)
   - https://raw.githubusercontent.com/maple-labs/open-term-loan/main/contracts/MapleLoan.sol
   - GitHub repo: https://github.com/maple-labs/open-term-loan

3. **Centrifuge ERC7540Vault.sol** (asynchronous vault, `safeTransferFrom` on deposit/redeem)
   - https://raw.githubusercontent.com/centrifuge/liquidity-pools/main/src/ERC7540Vault.sol
   - GitHub repo: https://github.com/centrifuge/liquidity-pools

4. **Ondo OUSG Documentation** (NAV oracle updated daily, no on-chain cash transfer)
   - https://docs.ondo.finance/qualified-access-products/ousg/overview

5. **Ondo USDY/rUSDY Documentation** (rebase model)
   - https://docs.ondo.finance/general-access-products/usdy/basics

6. **Maple Protocol Background** (pool interest accrual mechanics)
   - https://docs.maple.finance/technical-resources/protocol-overview/background.md

7. **Maple Protocol Actors** (roles: borrower, pool delegate, lender)
   - https://docs.maple.finance/technical-resources/protocol-overview/protocol-actors.md

8. **Maple Cash Management Pool** (off-chain T-bill investment, banking-day withdrawals)
   - https://docs.maple.finance/cash-management-pool/overview.md

9. **Centrifuge Tokenization Concepts**
   - https://docs.centrifuge.io/user/concepts/tokenization

10. **Centrifuge ERC-7540 Vault Concepts**
    - https://docs.centrifuge.io/user/concepts/vaults

11. **Goldfinch Introduction**
    - https://docs.goldfinch.finance/goldfinch/introduction-and-overview.md

12. **Goldfinch FAQ**
    - https://docs.goldfinch.finance/goldfinch/faq.md

13. **Franklin Templeton FOBXX** (blockchain as secondary record)
    - https://www.franklintempleton.com/strategies/franklin-onchain-us-government-money-fund

### Secondary Sources (Research Reports — Confirmed Accessible)

14. **FSB (2023).** *The Financial Stability Implications of Tokenisation.* Financial Stability Board, October 2023.
    - Archive: https://www.fsb.org/2023/10/
    - PDF: https://www.fsb.org/uploads/P121023.pdf

15. **Garcia Ocampo, D., Branzoli, N., & Cusmano, L. (2023).** *Crypto, tokens and DeFi: navigating the regulatory landscape.* BIS FSI Insights No. 49, May 2023.
    - https://www.bis.org/fsi/publ/insights49.htm
    - PDF: https://www.bis.org/fsi/publ/insights49.pdf

16. **MAS (2023).** *Project Guardian: Enabling Open and Interoperable Networks.* Monetary Authority of Singapore, November 2023.
    - https://www.mas.gov.sg/development/fintech/digital-assets

17. **Erickson, C., Naggar, M., & Chong, J. (2023).** *The Spectrum of Tokenization Report.* RWA.xyz, November 2023.
    - https://rwa.xyz/blog/the-spectrum-of-tokenization-report

18. **Chong, J. (2023).** *An Allocator's Guide to Tokenized Treasuries.* RWA.xyz, June 2023.
    - https://rwa.xyz/blog/tokenized-treasuries-report

19. **Moody's Ratings / RWA.xyz (2024).** *Sector In-Depth: Tokenized Private Credit.* June 2024.
    - https://rwa.xyz/blog/moodys-sector-in-depth-tokenized-private-credit

20. **Choe, B. (2026).** *Allocation Vaults: Primer for Institutional Asset Managers.* RWA.xyz, February 2026.
    - https://rwa.xyz/blog/allocation-vaults-primer-for-institutional-asset-managers

21. **Ragsdale, T., Chong, J., & Venkatakrishnan, M. (2023).** *An Unreal Primer on Real World Assets.* RWA.xyz, June 2023.
    - https://rwa.xyz/blog/primer-on-real-world-assets
    - Full PDF: https://docsend.com/view/u53utyp2j4ycg7r6

### Unverified Claims (Doc Sites Inaccessible at Time of Writing)

The following claims were included based on general industry knowledge but could not be confirmed via direct source access at the time of writing. They should be treated as unverified until independently confirmed:

- **RealT** — periodic USDC admin push to token holders. Source site (docs.realt.co) was inaccessible. Claim: pattern is widely documented in community discussions and protocol design notes.
- **Lofty.ai** — daily admin-triggered USDC distribution. Source site (help.lofty.ai) was inaccessible.
- **BUIDL (BlackRock/Securitize)** — contracts are proprietary and not open-source. Claim based on Securitize public statements and fund prospectus structure, not direct contract inspection.

# Test contract sources

All contracts are public exhibits from SEC EDGAR. Prices and some other redacted terms were replaced with
**synthetic values** for testing, and two missing price exhibits were written from scratch. Each prepared
copy carries a "TEST COPY" banner. None of these files is the agreement as filed.

- `source-html/` holds the files as downloaded from EDGAR, unchanged.
- `prepared-html/` holds the edited copies that are converted to PDF.
- `contracts/` holds the PDFs used for testing.

## Batch 1

### trilogy-flex

- **EDGAR:** https://www.sec.gov/Archives/edgar/data/1615219/000161521916000218/flks2016630ex-101.htm
- **Agreement:** Supply Agreement, Trilogy Essential Ingredients Inc. (supplier) and Flex Innovation Group LLC (customer), May 9, 2016
- **Synthetic values (replacing `[**]`):**
  - Lead Time definition: 30 days (approved formula) or 45 days (new formulations)
  - PO acceptance: within 3 business days (silence is deemed acceptance in the original)
  - Minimum Amount: raw materials sufficient to produce 500 kg of Product, over any 12-month period
  - Payment: 30 days
  - Exhibit A quote sheet: "Botanical Extract Blend 1A", water-dispersible blend of capsicum, ginger and black pepper extracts, $62.50/kg ($28.35/lb), lead time 30 days
- Other redactions (specifications, insurance amounts, notice periods) left as `[**]`.

### lannett-sino

- **EDGAR:** https://www.sec.gov/Archives/edgar/data/57725/000110465919061154/a19-18200_1ex10d59.htm
- **Agreement:** Distribution and Supply Agreement, Sinotherapeutics Inc. (supplier) and Lannett Company, Inc. (customer), August 2, 2019
- **Synthetic values (replacing `[***]`):**
  - Term: 5 years from the Effective Date (no end date stated, so expiration date should be null)
  - Renewal: 1-year terms, non-renewal notice at least 180 days before the end of the term
  - Exhibit A: Posaconazole DR tablets 100 mg, pack of 60, $310.00 per pack
- Other redactions (distribution fee, profit split, examples) left as `[***]`.

### seracare-wyeth

- **EDGAR:** https://www.sec.gov/Archives/edgar/data/1156295/000089843002004685/dex1012.htm
- **Agreement:** Supply Agreement, SeraCare Life Sciences (supplier), Instituto Grifols (manufacturer) and Wyeth Pharmaceuticals (customer), September 27, 2002
- **Synthetic values (replacing `***`):**
  - Requirements commitment: Wyeth buys at least 80% of its requirements
  - Manufacturer capacity: up to 24,000 bottles per year
  - Pricing basis and Appendix D: US$850.00 per 100 gram bottle
- Other redactions (product descriptions, remedies) and the page-footer confidentiality notices left as is.

### arnet-isatori

- **EDGAR:** https://www.sec.gov/Archives/edgar/data/0000741114/000151597112000097/exhibit104.htm
- **Agreement:** Manufacturing and Supply Agreement, Arnet Pharmaceutical Corp. (manufacturer) and iSatori Technologies, LLC (customer), March 11, 2011
- **Synthetic content:** Exhibit A was not filed. A synthetic Exhibit A was added at the end with 5 generic supplement products, per-unit prices ($2.10 to $9.75), minimum orders, monthly capacity and make-to-order flags.
- No redactions in the original.

### powin-stem

- **EDGAR:** https://www.sec.gov/Archives/edgar/data/1758766/000175876622000129/stem-10xq2022q2_ex102xmast.htm
- **Agreement:** Master Supply Agreement, Powin Energy Corporation (supplier) and Stem, Inc. (customer), September 14, 2020
- **Synthetic content:** Exhibit C was not filed. A synthetic Exhibit C was added at the end with:
  - Pricing Period through December 31, 2021
  - $/kWh volume tiers for 2-hour and 4-hour systems ($262 to $315 per kWh)
  - Annual adjustment by PPI, capped at ±4%
  - DAP delivery, net 30 payment, no minimum commitment
- The original's `[ ]` blanks (fees, cure periods) left as is.

## Batch 2: extra contracts for upload testing

`extra-contracts/` holds 7 more public EDGAR exhibits, each 10 pages or fewer, for trying uploads in the web app.
There are no answer keys, so they are not part of accuracy scoring. As in batch 1, redacted, blank or missing
values were replaced with **synthetic values**, listed below, and each PDF carries a "TEST COPY" banner that
says so.

- `extra-contracts/source-html/` holds the files exactly as downloaded from EDGAR.
- `extra-contracts/prepared-html/` holds the edited copies, which headless Chrome printed to PDF.

| File | Type | Parties | Pages | EDGAR |
| --- | --- | --- | --- | --- |
| `winland-nortech-manufacturing.pdf` | Manufacturing agreement (2011) | Winland Electronics, Inc. and Nortech Systems Incorporated | 9 | https://www.sec.gov/Archives/edgar/data/749935/000074993511000032/winlandmfgagreement.htm |
| `cleanspark-pioneer-contract-manufacturing.pdf` | Contract manufacturing agreement (2019) | Cleanspark, Inc. and Pioneer Power Solutions, Inc. | 8 | https://www.sec.gov/Archives/edgar/data/827876/000166357719000043/ex10_4.htm |
| `pelican-shine-msa.pdf` | Master services agreement (2020) | SHINE Management, Inc. (provider) and Pelican Delivers, Inc. (client) | 10 | https://www.sec.gov/Archives/edgar/data/1802830/000166225220000043/ex10_5.htm |
| `sharps-stericare-supply.pdf` | Supply agreement (2024) | Sharps Technology, Inc. (seller) and Stericare Solutions, LLC (buyer) | 10 | https://www.sec.gov/Archives/edgar/data/1737995/000149315224029022/ex10-1.htm |
| `chromadex-neutrisci-sales-contract.pdf` | Sales confirmation and contract, order-form style (2013) | ChromaDex Inc. (seller) and NeutriSci International, Inc. (customer) | 5 | https://www.sec.gov/Archives/edgar/data/1386570/000141588913000558/ex10-6.htm |
| `martek-wyeth-supply-amendment.pdf` | Amendment No. 1 to a supply agreement (2010) | Martek Biosciences Corporation and AHP Manufacturing B.V. (Wyeth Nutritionals Ireland) | 3 | https://www.sec.gov/Archives/edgar/data/892025/000110465910064577/a10-18183_1ex10d07.htm |
| `datchat-izea-sow.pdf` | Statement of work (2021) | IZEA Worldwide, Inc. (provider) and DatChat, Inc. (customer) | 5 | https://www.sec.gov/Archives/edgar/data/1648960/000121390021049804/ea147899ex10-1_datchat.htm |

### Synthetic values

- **cleanspark-pioneer, pelican-shine:** unchanged. They had no redactions. Pelican's asterisks mark clauses that survive termination, not redactions.
- **winland-nortech:** Section 4 sets Transfer Prices "on Exhibit A", which was not filed. A synthetic Exhibit A was added at the end:
  - 5 products, each with a part number, minimum order and USD unit price: EnviroAlert EA400 $64.20, EA200 $31.75, Water Alert probe $4.85, Temperature Alert sensor $7.10, Vision Alert assembly $18.40
  - FOB Nortech's Merrifield, Minnesota facility
  - prices may be adjusted once a year, on 60 days' notice, for component cost changes over 3%
- **sharps-stericare (replacing `xxxx`, `xxx` and `x`):**
  - price $38.50 per thousand syringes
  - polypropylene (PP) at $0.72/pound, in section 5(e) and Schedule 1
  - material content in grams: barrel 2.10, plunger 0.85, piston 0.25, cap 0.40
  - price review triggered by a 5 cents/pound change
  - +$0.35/thousand per 5 cents for PP, +$0.10/thousand per 5 cents for TPE or rubber
- **chromadex-neutrisci (blank fields):**
  - date March 28, 2013
  - contact Dana Whitfield, (780) 555-0147, a fictional person and number
  - ship-to and bill-to address 9400 Discovery Place, Suite 120, Edmonton, AB, which is fictional
  - price per unit $1,450.00 per kilogram, minimum order 5 kg
- **martek-wyeth (replacing `*`):**
  - the PURCHASER notice address (Askeaton, County Limerick, Ireland)
  - Exhibit A price table in USD per kg of oil: up to 50,000 kg $185.00; 50,001 to 150,000 kg $172.50; over 150,000 kg $161.00
  - pricing terms:
    - fixed for 2011, then annual PPI adjustment capped at 3% either way
    - 40,000 kg annual minimum
    - payment 45 days from invoice, FCA seller's facility
- **datchat-izea (replacing `[*]`):**
  - the redaction legend is replaced by the heading "STATEMENT OF WORK"
  - campaign "Q3 2021 Dat Chat Influencer Campaign", running August 2 to October 29, 2021
  - quantities and prices for all 11 line items:
    - TikTok video $2,500 each
    - celebrity Instagram photo $4,000 each
    - social share $1,500 each
    - story frame $750 each
    - two $5,000 promotion budgets
    - managed services $6,000 flat
    - other items included
  - 16 creator deliverables, total price $47,000.00

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

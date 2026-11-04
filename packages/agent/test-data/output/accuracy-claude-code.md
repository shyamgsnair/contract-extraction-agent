# Accuracy report (claude-code engine)

| Field | arnet-isatori | lannett-sino | powin-stem | seracare-wyeth | trilogy-flex | Accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| documentType | ✓ | ✓ | ✗ | ✓ | ✓ | 80% |
| customerName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| vendorName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| effectiveDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| expirationDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| autoRenews | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| priceEscalation | ✓ | ✓ | ✓ | ✓ | ✗ | 80% |
| paymentTermsDays | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| minimumCommitment | ✓ | ✗ | ✓ | ✓ | ✓ | 80% |
| poAcceptance | ✗ | ✓ | ✓ | ✗ | ✓ | 60% |
| priceList | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |

- **Overall accuracy:** 91% (50 of 55 scored fields; target 85%)
- **Lowest field:** poAcceptance at 60% (target: none below 60%)
- **Quotes not verified and not flagged:** 0 (target 0)
- **Contracts flagged for review:** 0 of 5
- **Run time and cost:** 131s, $1.65 equivalent API cost (not billed)
- **Unjudged free-text fields:** 0

**Verdict: GO**

## Misses

- **arnet-isatori**
  - poAcceptance: expected {"days":5,"dayType":"business","ifNoResponse":"rejected"}, got {"days":5,"dayType":"business","ifNoResponse":"not_stated"}
- **lannett-sino**
  - minimumCommitment: expected null, got "Lannett must purchase the Product exclusively from Supplier (exclusive supply); no fixed minimum quantity stated"
- **powin-stem**
  - documentType: expected "supply_agreement", got "msa"
- **seracare-wyeth**
  - poAcceptance: expected {"days":4,"dayType":"calendar","ifNoResponse":"not_stated"}, got null
- **trilogy-flex**
  - priceEscalation: expected "No increases provided; Supplier may reduce prices and must pass on cost reductions within 30 days", got null

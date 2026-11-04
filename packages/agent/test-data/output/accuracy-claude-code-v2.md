# Accuracy report (claude-code engine)

| Field | arnet-isatori | lannett-sino | powin-stem | seracare-wyeth | trilogy-flex | Accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| documentType | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| customerName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| vendorName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| effectiveDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| expirationDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| autoRenews | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| priceEscalation | ✓ | ✓ | ✓ | ✓ | ✗ | 80% |
| paymentTermsDays | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| minimumCommitment | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| poAcceptance | ✗ | ✓ | ✓ | ✓ | ✓ | 80% |
| priceList | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |

- **Overall accuracy:** 96% (53 of 55 scored fields; target 85%)
- **Lowest field:** priceEscalation at 80% (target: none below 60%)
- **Quotes not verified and not flagged:** 0 (target 0)
- **Contracts flagged for review:** 0 of 5
- **Run time and cost:** 111s, $0.56 equivalent API cost (not billed)
- **Unjudged free-text fields:** 0

**Verdict: GO**

## Misses

- **arnet-isatori**
  - poAcceptance: expected {"days":5,"dayType":"business","ifNoResponse":"rejected"}, got {"days":5,"dayType":"business","ifNoResponse":"not_stated"}
- **trilogy-flex**
  - priceEscalation: expected "No increases provided; Supplier may reduce prices and must pass on cost reductions within 30 days", got null
